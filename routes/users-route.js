const express = require("express");

const {
  getUserOrAddUser,
  subscribe,
  unsubscribe,
  editReminder,
  deleteReminder,
  addReminder,
  sendFeedback,
} = require("../controllers/users-controller");

const router = express.Router();

router.post("/", getUserOrAddUser);
router.put("/:id/subscribe", subscribe);
router.put("/:id/unsubscribe", unsubscribe);
router.put("/:id/reminders/:reminderId", editReminder);
router.delete("/:id/reminders/:reminderId", deleteReminder);
router.post("/:id/reminders", addReminder);
router.post("/:id/feedback", sendFeedback);

module.exports = router;
