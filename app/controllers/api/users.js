var User = require('../../models/users');
var Team = require('../../models/teams');
var mailer = require('../../libs/utils/nodemailer');


module.exports.index = function (req, next) {
    var self = this;

    var data = {
        env: process.env,

        flash: req.flash('message'),

        user: req.user
    };

    next(null, data);
};



module.exports.search = function(req,res) {
	User.find(req.query,function(err,foundUsers) {
		if (err) {
			res.send(err);
		} else {
			res.json(foundUsers);
		}

	})
}


module.exports.get = function(req,res) {
	var id = req.params.id;
	User.findById(id,function(err,user) {
		if (err) {
			res.send(err);
		} else {
			res.json(user);
		}
	})
} 

module.exports.create = function(req,res) {
	User.create(req.body,function(err,user) {
		if (err) {
			res.send(err);
		} else {
			res.json(user);
		}
	})
}





module.exports.update = function(req,res) {
	var team = req.body._team;
	var teamId = req.body._team._id;
	if (!teamId) { // admin/owner of the team signing up
		team.admin = req.body._id;
		Team.create(team,function(err,createdTeam) {
			if (err) {res.send(err);}
			else {
				teamId = createdTeam._id;
				User.findById(req.body._id,function(err,user) {
					if (err) {
						res.send(err);
					} else if (!user) {
						res.status(404).send('User not found');
					} else {
						if (user.provider == 'local' && req.body.password) {
							user.setPassword(req.body.password);
						} 
						user._team = teamId;
						user.save(function(err,savedUser) {
							if (err) {res.send(err);}
							else {
								mailer.sendActivationEmail(savedUser,function(err) {
									if (err) {
										res.status(500).send('Cannot send activation email');
									} else {
										res.json(savedUser);
									}
								})
							}
						})
					}
				})
			}
		})
	} else { //invited people, no need to send email
		User.findById(req.body._id,function(err,user) {
			if (err) {
				res.send(err);
			} else if (!user) {
				res.status(404).send('User not found');
			} else {
				if (user.provider == 'local' && req.body.password) {
					user.setPassword(req.body.password);
				} 
				user.save(function(err,savedUser) {
					if (err) {res.send(err);}
					else {
						res.json(savedUser);
					}
				})
			}
		})



	}

	

}


