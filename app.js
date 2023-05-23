const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const cronJobs = require("./cron-jobs");
require("dotenv").config();
const PORT = process.env.PORT || 5000;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://birthdayai-ae57c-default-rtdb.firebaseio.com",
});

const db = admin.database();

module.exports.db = db;

const usersRoutes = require("./routes/users-route");
const HttpError = require("./models/http-error");

const app = express();
app.use(cors());
app.use(bodyParser.json());

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
