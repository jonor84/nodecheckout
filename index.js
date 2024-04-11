const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const flash = require("connect-flash");
const bcrypt = require("bcrypt");

dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(flash());

const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function isAdminAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.isAdmin) {
    return next();
  }
  res.redirect("/alogin");
}

function isUserAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user && !req.user.isAdmin) {
    return next();
  }
  res.redirect("/login");
}

app.use(passport.initialize());
app.use(passport.session());

// Passport for users
passport.use(
  "user",
  new LocalStrategy((username, password, done) => {
    const users = require("./data/users.json");
    const user = users.find((user) => user.email === username);

    if (!user) {
      console.log("User not found.");
      return done(null, false, { message: "Invalid username or password" });
    }

    bcrypt.compare(password, user.password, (err, result) => {
      if (err || !result) {
        console.log("Incorrect password.");
        return done(null, false, { message: "Invalid username or password" });
      }
      console.log("User authenticated successfully.");
      return done(null, user);
    });
  })
);

// Passport for admins
passport.use(
  "admin",
  new LocalStrategy((username, password, done) => {
    const adminUsername = process.env.ADMIN_USER;
    const adminPassword = process.env.ADMIN_PASS;

    if (username === adminUsername && password === adminPassword) {
      const adminUser = {
        username: adminUsername,
        isAdmin: true,
      };
      console.log("Admin authenticated successfully.");
      return done(null, adminUser);
    } else {
      return done(null, false, { message: "Invalid admin credentials" });
    }
  })
);

// Serialize and deserialize users for sessions
passport.serializeUser((user, done) => {
  if (user.isAdmin) {
    done(null, user.username);
  } else {
    done(null, user.email);
  }
});

passport.deserializeUser((username, done) => {
  if (username === process.env.ADMIN_USER) {
    const adminUser = {
      username: process.env.ADMIN_USER,
      isAdmin: true,
    };
    return done(null, adminUser);
  } else {
    const users = require("./data/users.json");
    const user = users.find((user) => user.email === username);
    done(null, user);
  }
});

// Routes
app.post(
  "/login",
  passport.authenticate("user", {
    successRedirect: "/user/dashboard",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.post(
  "/alogin",
  passport.authenticate("admin", {
    successRedirect: "/admin/dashboard",
    failureRedirect: "/alogin",
    failureFlash: true,
  })
);

app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.isAdmin) {
      res.redirect("/admin/dashboard");
    } else {
      res.redirect("/user/dashboard");
    }
  } else {
    res.render("home", { error: null });
  }
});

app.get("/login", (req, res) => {
  res.render("login", { error: req.flash("error") });
});

app.get("/alogin", (req, res) => {
  res.render("alogin", { error: req.flash("error") });
});

app.get("/admin/dashboard", isAdminAuthenticated, (req, res) => {
  res.render("admin/dashboard", { user: req.user });
});

app.get("/admin/customers", isAdminAuthenticated, (req, res) => {
  res.render("admin/customers", { user: req.user });
});

app.get("/admin/orders", isAdminAuthenticated, (req, res) => {
  res.render("admin/orders", { user: req.user });
});

app.get("/user/dashboard", isUserAuthenticated, (req, res) => {
  const firstName = req.user.firstName;
  res.render("user/dashboard", { firstName: firstName });
});

app.get("/users/orders", isUserAuthenticated, (req, res) => {
  res.render("users/orders", { user: req.user });
});

app.get("/users/cart", isUserAuthenticated, (req, res) => {
  res.render("users/cart", { user: req.user });
});

app.get("/user/products", isUserAuthenticated, async (req, res) => {
  try {
    const products = await stripe.products.list();
    const prices = await stripe.prices.list();

    const productsWithPrices = products.data.map((product) => {
      const price = prices.data.find((price) => price.product === product.id);
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: price ? price.unit_amount / 100 : 0, // Convert to kr without decimals
      };
    });

    res.render("user/products", { products: productsWithPrices });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/logout", (req, res) => {
  if (req.isAuthenticated()) {
    req.logout("user", (err) => {
      if (err) {
        console.error("Error logging out:", err);
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        res.redirect("/");
      });
    });
  } else if (req.isAuthenticated("admin")) {
    req.logout("admin", (err) => {
      if (err) {
        console.error("Error logging out admin:", err);
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        res.redirect("/");
      });
    });
  } else {
    res.redirect("/");
  }
});

// Wildcard route for everything else
app.get("*", (req, res) => {
  const page = req.url.slice(1);
  const pagePath = path.join(__dirname, "views", `${page}.ejs`);

  fs.access(pagePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).render("404");
    }
    res.render(page);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
