const express = require('express');
const app = express();
const methodOverride = require('method-override')
app.use(methodOverride('_method')) 
require('dotenv').config();

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
const { createServer } = require('http')
const { Server } = require('socket.io')
const server = createServer(app)
const io = new Server(server)



app.set('view engine', 'ejs'); 
app.use(express.json()); 
app.use(express.urlencoded({extended:true}));

const { MongoClient, ObjectId } = require('mongodb')
let db
const url = process.env.mongodb_URL;
new MongoClient(url).connect().then((client)=>{
  console.log('DB연결성공');
  db = client.db('forum');
  server.listen(process.env.PORT, () => {
    console.log("http://localhost:" + process.env.PORT)
});
}).catch((err)=>{
  console.log(err)
})



app.use(passport.initialize())

const sessionMiddleware = session({
  resave : false,
  saveUninitialized : false,
  secret: process.env.session_secret, //세션 암호화 비밀번호
  cookie : {maxAge : 1000 * 60 * 60},
  store: MongoStore.create({
    mongoUrl : process.env.mongodb_URL, //홈페이지 DB접속용 URL'
    dbName: 'forum', //DB 이름
  })
})
app.use(sessionMiddleware)


app.use(sessionMiddleware)
  

app.use(passport.session())

passport.use(new LocalStrategy(async (ID, PASSWORD, cb) => {
    let result = await db.collection('user').findOne({ username : ID})
    if (!result) {
      return cb(null, false, { message: '아이디 DB에 없음' })
    }
  
    if (await bcrypt.compare(PASSWORD, result.password)) {
      return cb(null, result)
    } else {
      return cb(null, false, { message: '비번불일치' });
    }
  }))
  

passport.serializeUser((user, done) => {
    process.nextTick(() => {
      done(null, { id: user._id, username: user.username })
    })
  })
passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({_id : new ObjectId(user.id) })
    delete result.password
    process.nextTick(() => {
      return done(null, result)
    })
  })

  io.engine.use(sessionMiddleware)



app.get("/register", (req, res) => {
    res.render("register.ejs");
})
app.post('/register', async (req, res) => {
    if(req.body.password == req.body.password2) {
        let hash = await bcrypt.hash(req.body.password, 10) 
    await db.collection('user').insertOne({
      username : req.body.username,
      password : hash,
      chatroom : []
    })
    res.redirect('/')
    }else{
        res.send("[ERROR] 비밀번호 불일치")
    }
    
  })

app.get("/login", (req, res) => {
    res.render("login.ejs");
})
app.post('/login', async (req, res, next) => {

    passport.authenticate('local', (error, user, info) => {
        if (error) return res.status(500).json(error)
        if (!user) return res.status(401).json(info.message)
        req.logIn(user, (err) => {
          if (err) return next(err)
          res.redirect('/')
        })
    })(req, res, next)
  })

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
      if(err) { return next(err); }
      req.session.destroy();
      res.redirect("/");
    })
  }); 

  function addUserToLocal(req, res, next){
    res.locals.user = req.user || null;
    next();
  }
  
  function loggedIn(req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect('/login');
    }
  }
  
  app.use(addUserToLocal);
  

app.get('/', async (req,res, next) => {
  // res.render('chat-list', { page : ''})
    if(!req.user){
      res.render('chat-list', { page : '', result : 0});
    }else{
    let result = await db.collection('user').find().toArray()
    res.render('chat-list', { page : '', result })
    }
  })
  app.get('/modify_profile/:id', loggedIn, async (req, res, next) => {
    res.render('chat-list', { page : 'modify_profile' })
  })
app.put('/modify_profile', async (req,res) => {
  let hash = await bcrypt.hash(req.body.password, 10) 
  await db.collection('user').updateOne({ _id : new ObjectId(req.body.id)}, {$set: { username : req.body.username, password : hash}})
  res.redirect('/');
})


io.on('connection', async (socket) => {
  let memberList = await db.collection('user').findOne({ _id : new ObjectId(socket.request.session.passport.user.id)})
  if(memberList){
    socket.on('join', (data) =>{
      socket.join(data);
      
    })
  }
  socket.on('message-send', async (data) => {
    io.to(data.room).emit('broadcast', data.msg);
  })  


})

