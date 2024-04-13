## STARSHOP v1.0
A Node.js Express application that utilizes the EJS templating engine and seamlessly integrating with Stripe. The platform provides an intuitive interface for users to explore products, order products, and complete transactions with Stripe Checkout. Stripe products are fetched dynamically to showcase on the products page.

Key features include registration, user authentication, allowing only logged-in users to place orders, and a checkout process via Stripe Checkout. Upon successful payment, orders are automatically stored in an order.json file. User data is stored in a users.json file. The application includes an admin section accessed via credentials stored in a .env file.

This project was developed as part of a student project at Medieinstitutet in 2024.

## Getting Started
To run this Node project, you first need to ensure that you have Node.js installed on your computer. Visit https://nodejs.org/ and follow the installation instructions if you don't already have Node.js installed.

### Step 1: Clone the project
Clone this project to your local computer by running the following command in the terminal.

### Step 2: Install dependencies
Run: 

npm i

npm i express express session

npm i ejs

npm i bootstrap

npm i passport passport-auth0

npm i dotenv

npm i body parser

npm i axios

npm i joi


### Step 3: The ENV file
Put the .env content in a new .env file in your folder root (nodeimages) - the same folder as this readme file. 

It should contain: 
AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_CALLBACK_URL, SESSION_SECRET, GOOGLE_URL, GOOGLE_APIKEY and GOOGLE_CX

### Step 4: Start
Start the application by running node index.js
