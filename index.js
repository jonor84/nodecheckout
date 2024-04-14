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

app.use((req, res, next) => {
  const cartItems = req.session.cart || [];
  req.session.cartItemsCount = cartItems.length;
  next();
});

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

// Add new order to orders.json
const saveOrderData = (orderData) => {
  let ordersData = [];
  try {
    ordersData = JSON.parse(fs.readFileSync("data/orders.json", "utf8"));
  } catch (error) {
    console.error("Error reading orders data:", error);
  }

  // Find the highest existing order ID
  let maxOrderId = ordersData.reduce(
    (maxId, order) => Math.max(maxId, order.orderid || 0),
    10000 // Start with 10001 if no orders exist
  );

  const orderId = maxOrderId + 1;

  // Format the timestamp
  const timestamp = new Date().toISOString();

  // Create a new object with reordered properties
  const newOrderData = {
    orderid: orderId,
    timestamp: timestamp,
    ...orderData,
  };

  // Push the new order data to the beginning
  ordersData.unshift(newOrderData);

  try {
    fs.writeFileSync("data/orders.json", JSON.stringify(ordersData, null, 2));
    console.log("Order data saved successfully");
  } catch (error) {
    console.error("Error saving order data:", error);
  }
};

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

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { email, password, firstName, lastName, address, zip, town, country } =
    req.body;

  // Check if user/email exist
  const users = require("./data/users.json");
  const existingUser = users.find((user) => user.email === email);
  if (existingUser) {
    req.flash("error", "Email is already registered. Please log in.");
    return res.redirect("/login");
  }

  bcrypt.hash(password, 10, async (err, hashedPassword) => {
    if (err) {
      console.error("Error hashing password:", err);
      req.flash("error", "An error occurred. Please try again later.");
      return res.redirect("/register");
    }

    try {
      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        email,
        name: `${firstName} ${lastName}`,
        address: {
          line1: address,
          postal_code: zip,
          city: town,
          country,
        },
      });
      console.log("User added to Stripe.");

      // Save the user to the users.json file
      const newUser = {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        address,
        zip,
        town,
        country,
        stripeCustomerId: customer.id,
      };

      users.push(newUser);
      fs.writeFile(
        "./data/users.json",
        JSON.stringify(users, null, 2),
        (err) => {
          if (err) {
            console.error("Error saving user to database:", err);
            req.flash("error", "An error occurred. Please try again later.");
            return res.redirect("/register");
          }

          console.log("User added to json.");
          req.flash("success", "Registration complete. You can now login.");
          res.redirect("/login");
        }
      );
    } catch (error) {
      console.error("Error creating customer in Stripe:", error);
      req.flash("error", "An error occurred. Please try again later.");
      res.redirect("/register");
    }
  });
});

app.post("/checkout", isUserAuthenticated, async (req, res) => {
  const cartItemIds = req.session.cart || [];

  try {
    if (cartItemIds.length === 0) {
      throw new Error("No items in the cart");
    }
    // Fetch product details for each product ID in the cart
    const cartItems = await Promise.all(
      cartItemIds.map(async (productId) => {
        const product = await stripe.products.retrieve(productId);
        const price = await stripe.prices.list({
          product: productId,
          limit: 1,
        });
        return {
          id: productId,
          name: product.name,
          price: price.data[0].unit_amount / 100,
        };
      })
    );

    // Create the checkout session using the cart items
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: cartItems.map((item) => ({
        price_data: {
          currency: "sek",
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: 1,
      })),
      mode: "payment",
      customer: req.user.stripeCustomerId,
      success_url: `${req.protocol}://${req.get("host")}/user/confirmation`,
      cancel_url: `${req.protocol}://${req.get("host")}/user/cart`,
    });

    // Redirect to Stripe checkout page
    res.redirect(session.url);
  } catch (error) {
    console.error("Error creating checkout session:", error);
    req.flash("error", `Something went wrong, error: ${error.message}`);
    res.redirect("/user/cart");
  }
});

app.get("/login", (req, res) => {
  res.render("login", {
    error: req.flash("error"),
    success: req.flash("success"),
  });
});

app.get("/alogin", (req, res) => {
  res.render("alogin", { error: req.flash("error") });
});

app.get("/admin/dashboard", isAdminAuthenticated, (req, res) => {
  res.render("admin/dashboard", { user: req.user });
});

app.get("/admin/orders", isAdminAuthenticated, (req, res) => {
  const allOrders = require("./data/orders.json");

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  res.render("admin/orders", {
    allOrders: allOrders,
    formatDate: formatDate,
  });
});

app.get("/admin/customers", isAdminAuthenticated, (req, res) => {
  const allUsers = require("./data/users.json");

  res.render("admin/customers", {
    allUsers: allUsers,
  });
});

app.get("/user/dashboard", isUserAuthenticated, (req, res) => {
  const firstName = req.user.firstName;
  const cartItemsCount = req.session.cartItemsCount;
  console.log(cartItemsCount);
  res.render("user/dashboard", {
    firstName: firstName,
    cartItemsCount: cartItemsCount,
  });
});

app.get("/addtocart/:productId", isUserAuthenticated, (req, res) => {
  const productId = req.params.productId;
  console.log("Product ID:", productId);

  if (!req.session.cart) {
    req.session.cart = [];
  }

  req.session.cart.push(productId);

  req.session.cartItemsCount = req.session.cart.length;
  console.log("Cart items count:", req.session.cartItemsCount);

  req.flash("success", "Item added to cart!");
  console.log("Session:", req.session);

  res.json({ success: true, cartItemsCount: req.session.cartItemsCount });
});

// Define productsWithPrices for products, cart etc
let productsWithPrices;

app.get("/user/orders", isUserAuthenticated, (req, res) => {
  const userOrders = require("./data/orders.json").filter(
    (order) => order.email === req.user.email
  );
  const cartItemsCount = req.session.cartItemsCount;
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }
  res.render("user/orders", {
    user: req.user,
    cartItemsCount: cartItemsCount,
    userOrders: userOrders,
    formatDate: formatDate,
  });
});

app.get("/user/confirmation", isUserAuthenticated, async (req, res) => {
  const cartItemIds = req.session.cart || [];
  const cartItems = await Promise.all(
    cartItemIds.map(async (productId) => {
      const product = await stripe.products.retrieve(productId);
      const price = await stripe.prices.list({
        product: productId,
        limit: 1,
      });
      return {
        id: productId,
        name: product.name,
        price: price.data[0].unit_amount / 100,
      };
    })
  );

  const totalPrice = cartItems.reduce((total, item) => total + item.price, 0);

  const orderData = {
    email: req.user.email,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    address: req.user.address,
    zip: req.user.zip,
    town: req.user.town,
    country: req.user.country,
    totalPrice: totalPrice,
    cartItems: cartItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: 1,
      price: item.price,
    })),
  };

  saveOrderData(orderData);

  req.session.cart = [];
  req.session.save();

  res.render("user/confirmation", { orderData });
});

app.get("/user/products", isUserAuthenticated, async (req, res) => {
  try {
    const products = await stripe.products.list();
    const prices = await stripe.prices.list();
    productsWithPrices = products.data.map((product) => {
      const price = prices.data.find((price) => price.product === product.id);
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: price ? price.unit_amount / 100 : 0,
      };
    });
    const cartItemsCount = req.session.cartItemsCount;
    const successMessages = req.flash("success");
    console.log("Success Messages:", successMessages);

    res.render("user/products", {
      products: productsWithPrices,
      cartItemsCount: cartItemsCount,
      successMessages: successMessages,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/user/cart", isUserAuthenticated, async (req, res) => {
  const cartItemsCount = req.session.cartItemsCount;
  const cartItemIds = req.session.cart || [];

  try {
    // Fetch product details for each product ID in the cart
    const cartItems = await Promise.all(
      cartItemIds.map(async (productId) => {
        const product = productsWithPrices.find(
          (product) => product.id === productId
        );
        return product;
      })
    );

    // Format thousand with a space
    function formatPrice(price) {
      let priceString = price.toString();
      let parts = priceString.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return parts.join(",");
    }

    // Calculate tax
    function calculateTax(cartItems) {
      const taxRate = 0.25; // 25%
      const totalPrice = cartItems.reduce(
        (total, item) => total + item.price,
        0
      );
      const taxAmount = (totalPrice / (1 + taxRate)) * taxRate;
      return taxAmount;
    }

    res.render("user/cart", {
      user: req.user,
      cartItemsCount: cartItemsCount,
      cartItems: cartItems,
      formatPrice: formatPrice,
      calculateTax: calculateTax,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
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
