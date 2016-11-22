var nodemailer = require('nodemailer');
var xoauth2 = require('xoauth2');
var jwt = require('jsonwebtoken');
var jwtSecret = process.env.JWT_SECRET;

var host = process.env.HOST || 'localhost';
var port = process.env.PORT || 9080;
var url = "http://" + host + ":" + port


var transporter = nodemailer.createTransport({
	service: "Gmail",
	auth: {
		xoauth2: xoauth2.createXOAuth2Generator({
			user: 'susanna@schemadesign.com',
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
			accessToken: process.env.GOOGLE_ACCESS_TOKEN
		})
	},
	logger: true,
	debug: true

});

function sendEmail (mailOptions,callback) {
	transporter.sendMail(mailOptions,function(err) {
		callback(err);
	})
}

module.exports.sendActivationEmail = function(user,cb) {
	var token = jwt.sign({
		_id: user._id,
		email: user.email,
		exp: 1440
	},jwtSecret);
	var activationLink = url + '/verify?token=' + token;
	var mailOptions = {
		from: 'Arrays <donotreply@arrays.co',
		to: user.email,
		subject: 'Welcome To Arrays!',
		html: 'Hi ' + user.firstName + ", <br> Thank you for signing up with us ! Your account has been created, please <a href='" + 
		activationLink + "'> activate it here </a> and start visualizing your data!" 
	}
	sendMail(mailOptions,function(err) {
		cb(err);
	})
}


module.exports.sendInvitationEmail = function(admin,invite,cb) {

}


