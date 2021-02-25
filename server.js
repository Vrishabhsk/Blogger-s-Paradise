require("dotenv").config();
const express = require('express')
const ejs = require('ejs')
const bodyParser = require('body-parser')
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const { check , validationResult } = require("express-validator");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require("mongoose-findorcreate");


const app = express()
app.set('view engine', 'ejs')
app.use(express.static("public"))
app.use(bodyParser.urlencoded({extended: true}));

app.use(session({ 
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}))

app.use(passport.initialize());

app.use(passport.session());

uri = "mongodb+srv://"+ process.env.USER +":"+ process.env.PASS +"@cluster0.ueenf.mongodb.net/bloggersParadiseDB";

mongoose.connect(uri, {useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false});

const blogSchema = new mongoose.Schema({
    blogUsername: String,
    blogTitle: String,
    blogContent: String,
    blogUploadDate: String
});

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    googleId: String,
    googleDisplayName: String,
    facebookId: String,
    facebookDisplayName: String,
    userBlogs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Blog"}]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const Blog = mongoose.model('Blog',blogSchema)
const User = mongoose.model("User",userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
    done(null, user.id);
  });
  
  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
  });

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/bloggersparadise",
    proxy: true
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id, googleDisplayName: profile.name.givenName }, function (err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/bloggersparadise"
  },
  function(accessToken, refreshToken, profile, cb) {
    displayName = profile.displayName.split(" ");
    User.findOrCreate({ facebookId: profile.id, facebookDisplayName: displayName[0]}, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get("/",(req,res) => {
    Blog.find({},(err,blogsFound) => {
        if(err) throw err;
        res.render("home",{content: blogsFound, isUser: req.isAuthenticated(), isHome: true});
    })
});

app.get("/auth/google",
    passport.authenticate("google",{ scope: ["profile"] })
);

app.get("/auth/google/bloggersparadise", 
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect("/");
  }
);

app.get("/auth/facebook",
  passport.authenticate('facebook'));

app.get("/auth/facebook/bloggersparadise",
  passport.authenticate('facebook', { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect("/");
  }
);

app.get("/compose",(req,res) => {
    if(req.isAuthenticated())
        res.render("compose",{isUser: true, isHome: false});
    else
        res.redirect("/login");
})

app.post("/compose",(req,res) => {
    const blogT = req.body.blogTitle;
    const blogC = req.body.blogContent;
    const day = new Date().toLocaleDateString();
    let blogU = ""
    if(req.user.googleDisplayName)
        blogU = req.user.googleDisplayName;
    else if(req.user.facebookDisplayName)
        blogU = req.user.facebookDisplayName;
    else {
        blogU = req.user.username;
        blogD = blogU.split(" ");
        blogU = blogD[0];
    }
    const newBlog = new Blog({
        blogUsername: blogU,
        blogTitle: blogT,
        blogContent: blogC,
        blogUploadDate: day
    });
    newBlog.save((err) => {
        if(err) throw (err);
        req.user.userBlogs.push(newBlog);
        req.user.save((err) => {
            if(err) throw err;
        });
        res.redirect("/");
    });
})

app.get("/posts/:blogId", (req,res) => {
    const blog = req.params.blogId;
    if(blog==="about")
        res.redirect("/about")
    else if(blog==="myposts")
        res.redirect("/myposts")
    else if(blog==="logout")
        res.redirect("/logout")
    else if(blog==="login")
        res.redirect("/login")
    else {
        Blog.findOne({_id: blog},(err,blogFound) => {
            if(err) throw (err);
            res.render("blogs",{content: blogFound, isUser: req.isAuthenticated(), isHome: false});
        })
    }
})

app.get("/about",(req,res) => {
    res.render("about",{isUser: req.isAuthenticated(), isHome: false});
})

app.get("/login",(req,res) => {
    res.render("login",{isUser: false, isHome: false})
});


app.post("/login",[
    check("username")
        .custom(async value => {
            try {
                const user = await User.findOne({username: value});
                if(!user) {
                    return Promise.reject("Please Register First");
                }
            } catch(err) {
                console.log(err);
            }
        })
],(req,res) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        const alert = errors.array()
        res.render("login",{alert, isUser: false, isHome: false});
    } else {
        const newUser = new User({
            username: req.body.username,
            password: req.body.password
        });
        req.login(newUser,(err) => {
            if(err) 
                throw err;
            passport.authenticate('local')(req,res,() => {
                res.redirect("/");
            })
        })
    }
})


app.get("/register",(req,res) => {
    res.render("register",{isUser: false, isHome: false})
})

app.post("/register", [
    //validation of user
    check("username","Username must be 3+ Characters long")
        .isLength({min: 3})
        .custom(async value => {
            try {
                const user = await User.findOne({ username: value });
                if (user) {
                    return Promise.reject("Username: " + value + " is Taken");
                }
            } catch(err) {
                console.log(err);
            }
        }),
    check("email","Please enter a valid Email-ID")
        .isEmail()
        .custom(async value => {
            try {
                const user = await User.findOne({ email: value });
                if (user) {
                    return Promise.reject("Email-ID is already in use");
                }
            } catch(err) {
                console.log(err);
            }
        })
        .normalizeEmail(),
    check("password")
        .isLength({min: 6}),
    check("confirmPassword")
        .custom((value,{req}) => {
            if(value !== req.body.password)
                throw new Error("Passwords do no match");
            return true;
        })
], (req,res) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const alert = errors.array()
        res.render("register",{alert,isUser: false, isHome: false})
    } else {
        User.register({username: req.body.username, email: req.body.email},req.body.password,(err,user) => {
            if(err) {
                console.log(err);
                res.redirect("/register");
            } else {
                passport.authenticate("local")(req,res,() => {
                    res.redirect("/");
                });
            }
        });
    }
});

app.get("/myposts",(req,res) => {
    if(req.isAuthenticated()) {
        User.find({_id: req.user._id}).populate("userBlogs").exec((err,foundBlogs) => {
            if(err) throw err;
            res.render("mypost",{content: foundBlogs[0].userBlogs, isUser: true, user: req.user, isHome: false});
        })
    }
    else
        res.redirect("/login");
})

app.post("/handlePosts",(req,res) => {
    Blog.findByIdAndDelete(req.body.id,(err,res) => {
        if(err) throw err;
    });
    const arr = req.user.userBlogs;
    const ind = arr.indexOf(req.body.id);
    arr.splice(ind,1);
    User.findOneAndUpdate({_id: req.user._id}, {userBlogs: arr},(err,result) => {
        if(err) throw err;
    })
    res.redirect("myposts");
})

app.get("/update",(req,res) => {
    if(req.isAuthenticated()){
        res.render("update",{isUser: true, isHome: false, user: req.user})
    } else {
        res.redirect("/login");
    }
})

app.post("/update",(req,res) => {
    const username = req.body.username;
    const email = req.body.email;
    if(username!=="" && email!=="") {
        User.findById(req.user._id,(err,user) => {
            if(err) throw err;
            if(req.user.googleDisplayName)
                user.googleDisplayName = username;
            else if(req.user.facebookDisplayName)
                user.facebookDisplayName = username;
            else { 
                user.username = username;
                user.email = email;
            }
            user.save((err) => {
                if(err) throw err;
            })
        })
    }
    res.redirect("/");
})

app.post("/delete",(req,res) => {
    const blogs = req.user.userBlogs;
    for(let i = 0;i<blogs.length;i++){
        Blog.findByIdAndDelete(blogs[i],(err,exec) => {
            if(err) throw err;
        })
    }
    User.findByIdAndDelete(req.user._id,(err,exec) => {
        if(err) throw err;
    })
    res.redirect("/"); 
})

app.get("/logout",(req,res) => {
    req.logout();
    res.redirect("/");
})

let port = process.env.PORT;
if (port == null || port == "") {
  port = 8000;
}

app.listen(port, () => {
    console.log("server started on http://localhost:3000")
});