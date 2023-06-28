const { db, bucket } = require("../database");
const openai = require("../cron-jobs");
const axios = require("axios");

function getUserOrAddUser(req, res, next) {
  const uid = req.body.id;
  const phoneNumber = req.body.phoneNumber;

  // Default user data
  const defaultUser = {
    id: uid,
    phoneNumber: phoneNumber,
    subscription: false,
    reminders: {},
  };

  // Try to get the user
  db.ref("users/" + uid)
    .once("value")
    .then(function (snapshot) {
      if (snapshot.exists()) {
        // User exists
        res.json({ user: snapshot.val() });
      } else {
        // User doesn't exist, add the user
        db.ref("users/" + uid)
          .set(defaultUser)
          .then(function () {
            res.json({ message: "User added successfully", user: defaultUser });
          })
          .catch(function (error) {
            next(error); // Forward the error to the error handler middleware
          });
      }
    })
    .catch(function (error) {
      next(error); // Forward the error to the error handler middleware
    });
}

function updateSubscription(req, res, next) {
  const uid = req.params.id;
  const isSubscribed = req.body.isSubscribed; // now getting the value from the request body
  db.ref("users/" + uid)
    .update({ subscription: isSubscribed })
    .then(function () {
      const message = isSubscribed
        ? "User subscribed successfully"
        : "User unsubscribed successfully";
      res.json({ message });
    });
}

function subscribe(req, res, next) {
  const uid = req.params.id;
  db.ref("users/" + uid)
    .update({ subscription: true })
    .then(function () {
      res.json({ message: "User subscribed successfully" });
    });
}

function unsubscribe(req, res, next) {
  const uid = req.params.id;
  db.ref("users/" + uid)
    .update({ subscription: false })
    .then(function () {
      res.json({ message: "User unsubscribed successfully" });
    });
}

function editReminder(req, res, next) {
  const uid = req.params.id;
  const reminderId = req.params.reminderId;
  db.ref("users/" + uid + "/reminders/" + reminderId)
    .update(req.body)
    .then(function () {
      res.json({ message: "Reminder edited successfully" });
    });
}

function deleteReminder(req, res, next) {
  const uid = req.params.id;
  const reminderId = req.params.reminderId;
  db.ref("users/" + uid + "/reminders/" + reminderId)
    .remove()
    .then(function () {
      res.json({ message: "Reminder deleted successfully" });
    });
}

function addReminder(req, res, next) {
  const uid = req.params.id;
  const reminderId = req.body.id;
  const newReminderRef = db.ref(`users/${uid}/reminders/${reminderId}`);
  newReminderRef
    .set(req.body)
    .then(function () {
      res.json({
        message: "Reminder added successfully",
        reminderId: reminderId,
      });
    })
    .catch((error) => {
      console.error("There has been a problem with your add operation:", error);
      next(error);
    });
}

function sendFeedback(req, res, next) {
  const uid = req.params.id;
  const newFeedbackRef = db.ref("feedback/" + uid).push();
  newFeedbackRef.set(req.body.feedback).then(function () {
    res.json({
      message: "Feedback sent successfully",
      feedbackId: newFeedbackRef.key,
    });
  });
}

async function addCard(req, res, next) {
  const uid = req.params.id;
  const cardId = req.body.id;

  let card = req.body;

  let prompt = `A ${card.type} card`;

  if (card.type === "holiday") {
    prompt = `A ${card.type} card for ${card.name}`;
  }

  if (card.type === "anniversary") {
    prompt = "A card for an anniversary";
  }

  const response = await openai.createImage({
    prompt: prompt,
    n: 1,
    size: "256x256",
  });
  const image_url = response.data.data[0].url;
  axios({
    url: image_url,
    responseType: "arraybuffer",
  })
    .then((response) => {
      const imageBuffer = Buffer.from(response.data, "binary");

      const file = bucket.file(`userImages/${uid}/${cardId}.jpg`);

      const blobStream = file.createWriteStream({
        metadata: {
          contentType: "image/jpg",
        },
      });

      blobStream.on("error", (err) => {
        console.log(
          "Something is wrong! Unable to upload at the moment." + err
        );
      });

      blobStream.on("finish", async () => {
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: "03-17-2300",
        });
        console.log("The signed url for the image is:", url);

        card = { ...card, link: url };

        const newCardRef = db.ref(`users/${uid}/cards/${cardId}`);
        const userRef = db.ref(`users/${uid}`);
        let snapshot = await userRef.once("value");
        let userData = snapshot.val();
        let monthlyCardCount =
          userData && userData.monthlyCardCount
            ? userData.monthlyCardCount + 1
            : 1;
        try {
          await newCardRef.set(card);
          await userRef.update({ monthlyCardCount: monthlyCardCount });
          res.json({
            message: "Card added successfully",
            cardId: cardId,
            card: card,
            monthlyCardCount: monthlyCardCount,
          });
        } catch (error) {
          console.error(
            "There has been a problem with your add operation:",
            error
          );
          next(error);
        }
      });

      blobStream.end(imageBuffer);
    })
    .catch((error) => {
      console.log("error in download or upload: ", error);
    });
}

async function deleteCard(req, res, next) {
  const uid = req.params.id;
  const cardId = req.params.cardId;

  // Create a reference to the file to delete
  const file = bucket.file(`userImages/${uid}/${cardId}.jpg`);

  // Delete the file
  file
    .delete()
    .then(() => {
      // File deleted successfully
      console.log(`Successfully deleted file: userImages/${uid}/${cardId}.jpg`);

      // Delete the reference to this card in the database
      db.ref("users/" + uid + "/cards/" + cardId)
        .remove()
        .then(() => {
          res.json({ message: "Card deleted successfully" });
        })
        .catch((error) => {
          console.error(
            "There was an error while deleting card from DB:",
            error
          );
          next(error);
        });
    })
    .catch((err) => {
      // Uh-oh, an error occurred!
      console.error(
        "There was an error while deleting image from Storage:",
        err
      );
      next(err);
    });
}

function editCard(req, res, next) {
  const uid = req.params.id;
  const cardId = req.params.cardId;
  db.ref("users/" + uid + "/cards/" + cardId)
    .update(req.body)
    .then(function () {
      res.json({ message: "Card edited successfully", card: req.body });
    });
}

module.exports = {
  getUserOrAddUser,
  subscribe,
  unsubscribe,
  updateSubscription,
  editReminder,
  deleteReminder,
  addReminder,
  sendFeedback,
  addCard,
  deleteCard,
  editCard,
};
