const passport = require('passport')
const mongoose = require('mongoose')
const User = mongoose.model('User')
const crypto = require('crypto')
const promisify = require('es6-promisify')
const mail = require('../handlers/mail')

exports.login = passport.authenticate('local', {
  failureRedirect: '/login',
  failureFlash: 'Failed Login',
  successRedirect: '/'
  // successFlash: 'You are now logged in.'
})

exports.logout = (req, res) => {
  req.logout()
  req.flash('success', 'You are now logged out.')
  res.redirect('back')
}

exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) { 
    return next() 
  }
  req.flash('error', 'Please log in first.')
  res.redirect('/login')
}

exports.forgotForm = (req, res) => {
  res.render('forgot', {title: 'Forgot Password'})
}

exports.forgot = async (req, res) => {
  // 1. See if a user with that email exists
  const user = await User.findOne({
    email: req.body.email
  })
  if (!user) {
    req.flash('success', 'A password reset link has been sent.') // lie
    return res.redirect('/login')
  }
  // 2. Set reset tokens and expiry on their account
  user.resetPasswordToken = crypto.randomBytes(20).toString('hex')
  user.resetPasswordExpires = Date.now() + 3600000 // 1 hour from now
  await user.save()
  // 3. Send them an email with the token
  const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`
  await mail.send({
    user,
    filename: 'password-reset',
    subject: 'Password Reset',
    resetURL
  });
  req.flash('success', `A password reset link has been sent.`)
  // 4. Redirect to login page
  res.redirect('/login')
}

exports.reset = async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() } // greater than now
  })
  if (!user) {
    req.flash('error', 'Password reset is invalid or has expired')
    return res.redirect('/login')
  }
  // if there is a user, show the reset password form
  res.render('reset', { title: 'Reset Your Password' })
}

exports.confirmedPasswords = (req, res, next) => {
  if (req.body.password === req.body['password-confirm']) {
    return next();
  }
  req.flash('error', 'Passwords do not match.')
  res.redirect('back')
}

exports.updatePassword = async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() } // greater than now
  })

  if (!user) {
    req.flash('error', 'Password reset is invalid or has expired')
    return res.redirect('/login')
  }

  const setPassword = promisify(user.setPassword, user)
  await setPassword(req.body.password)
  user.resetPasswordToken = undefined
  user.resetPasswordExpires = undefined
  const updatedUser = await user.save()
  await req.login(updatedUser)
  req.flash('success', 'Your password has been reset. You are now logged in.')
  res.redirect('/')
}