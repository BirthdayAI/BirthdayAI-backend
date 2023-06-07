const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const dotenvExpand = require("dotenv-expand");

const myLocalEnv = dotenv.config({ path: ".env.local" });
dotenvExpand.expand(myLocalEnv);

const myEnv = dotenv.config();
dotenvExpand.expand(myEnv);

const db = require("./database");
const cronJobs = require("./cron-jobs");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const PORT = process.env.PORT || 5000;

const usersRoutes = require("./routes/users-route");
const HttpError = require("./models/http-error");

const app = express();
app.use(
  cors({
    origin: [
      "https://birthdayaiapp.com",
      "http://localhost:3000",
      "https://checkout.stripe.com",
      "https://dashboard.stripe.com",
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    optionsSuccessStatus: 200,
  })
);

app.use(bodyParser.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// Utility function to update subscription status in Firebase
async function updateSubscriptionStatusInFirebase(customer, isActive) {
  // Get the Firebase user with this Stripe customer ID
  const userRef = db
    .ref("users")
    .orderByChild("stripeCustomerId")
    .equalTo(customer);
  userRef.once("value", function (snapshot) {
    if (snapshot.exists()) {
      // Update their subscription status
      const updates = {};
      updates["/users/" + Object.keys(snapshot.val())[0] + "/subscription"] =
        isActive;
      firebase.database().ref().update(updates);
    } else {
      console.log(`No matching Firebase user for Stripe customer ${customer}`);
    }
  });
}

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    let event = request.body;
    const endpointSecret = process.env.STRIPE_SIGNING_SECRET;
    if (endpointSecret) {
      const signature = request.headers["stripe-signature"];
      try {
        event = stripe.webhooks.constructEvent(
          request.body,
          signature,
          endpointSecret
        );
      } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`, err.message);
        return response.sendStatus(400);
      }
    }
    let subscription;
    let status;
    let customer;
    // Handle the event
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        subscription = event.data.object;
        status = subscription.status;
        customer = subscription.customer;
        console.log(
          `Subscription status for customer ${customer} is ${status}.`
        );

        if (status === "active") {
          await updateSubscriptionStatusInFirebase(customer, true);
        }
        break;
      case "customer.subscription.deleted":
        subscription = event.data.object;
        customer = subscription.customer;
        console.log(`Subscription for customer ${customer} is deleted.`);
        await updateSubscriptionStatusInFirebase(customer, false);
        break;
      default:
        console.log(`Unhandled event type ${event.type}.`);
    }
    response.send();
  }
);

// Add the authenticate middleware here
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/Bearer (.*)/);

  if (!match) {
    res.status(401).end();
    return;
  }

  const token = match[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).end();
  }
}

app.use(authenticate);

app.post("/create-checkout-session", async (req, res) => {
  const uid = req.body.uid; // You would get this from your frontend or authentication system

  // Get user from Firebase
  var userRef = db.ref("users/" + uid);
  userRef.once("value", async function (snapshot) {
    var userData = snapshot.val();

    // Check if user already has a Stripe customer ID
    if (!userData.stripeCustomerId) {
      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        description: uid,
      });

      // Save the Stripe customer ID in Firebase
      userRef.update({
        stripeCustomerId: customer.id,
      });

      userData.stripeCustomerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: userData.stripeCustomerId,
      billing_address_collection: "auto",
      line_items: [
        {
          price: req.body.priceId,
          // For metered billing, do not pass quantity
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/home?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/home?canceled=true`,
    });

    res.json({ sessionId: session.id });
  });
});

app.post("/create-portal-session", async (req, res) => {
  const uid = req.body.uid; // get this from the request, it will be passed by the frontend

  // Get user from Firebase
  var userRef = db.ref("users/" + uid);
  userRef.once("value", async function (snapshot) {
    var userData = snapshot.val();

    // This is the url to which the customer will be redirected when they are done
    // managing their billing with the portal.
    const returnUrl = `${process.env.FRONTEND_URL}/home`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: userData.stripeCustomerId,
      return_url: returnUrl,
    });

    res.json({ sessionId: portalSession.id, url: portalSession.url });
  });
});

app.use("/api/users", usersRoutes);

app.use((req, res, next) => {
  throw new HttpError("Could not find this route");
});

app.use((error, req, res, next) => {
  if (res.headerSent) {
    return next(error);
  }
  res.status(error.code || 500);
  res.json({ message: error.message || "An unknown error occured" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
