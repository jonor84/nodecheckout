const fs = require('fs');
var path = require('path');
const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// app.use(session({
//   secret: process.env.SESSION_SECRET,
//   resave: false,
//   saveUninitialized: true
// }));

// check if the user is authenticated
// const isAuthenticated = (req, res, next) => {
//   if (req.isAuthenticated()) {
//       return next(); 
//   }
//   res.redirect('/'); // User is not authenticated, redirect to home
// };


app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "favicon.ico"));
});

// Define routes
// app.get('/', (req, res) => {
//   // Check if user is authenticated
//   if (req.isAuthenticated()) {
//       res.redirect('/dashboard');
//   } else {
//       res.render('home');
//   }
// });

// Render home page with layout
app.get("/", (req, res) => {
  res.render('home');
});

// app.get('/dashboard', isAuthenticated, (req, res) => {
//   const firstName = req.session.firstName || 'NONAME';
//   res.render('dashboard', { firstName: firstName });
// });

// app.get('/logout', (req, res) => {
//   req.session.firstName = null;
//   req.logout(() => {
//       res.redirect('/');
//   });
// });

// Wildcard route for everything else
app.get("*", (req, res) => {
  const page = req.url.slice(1);
  const pagePath = path.join(__dirname, "views", `${page}.ejs`);
  console.log("Page Path:", pagePath);

  // Check if the requested page exists
  fs.access(pagePath, fs.constants.F_OK, (err) => {
      if (err) {
          // Page does not exist, render the 404.ejs page
          return res.status(404).render("404");
      }
      // Page exists, render it
      res.render(page);
  });
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});