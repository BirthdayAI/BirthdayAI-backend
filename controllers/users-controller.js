const { db } = require("../app");

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

module.exports = {
  getUserOrAddUser,
  subscribe,
  unsubscribe,
  editReminder,
  deleteReminder,
  addReminder,
  sendFeedback,
};
