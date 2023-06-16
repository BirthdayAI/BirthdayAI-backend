const express = require("express");

const {
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
} = require("../controllers/users-controller");

const router = express.Router();

router.post("/", getUserOrAddUser);
router.put("/:id/subscribe", subscribe);
router.put("/:id/unsubscribe", unsubscribe);
router.put("/:id/subscription", updateSubscription);
router.put("/:id/reminders/:reminderId", editReminder);
router.delete("/:id/reminders/:reminderId", deleteReminder);
router.post("/:id/reminders", addReminder);
router.post("/:id/feedback", sendFeedback);
router.post("/:id/cards", addCard);
router.delete("/:id/cards/:cardId", deleteCard);
router.put("/:id/cards/:cardId", editCard);

module.exports = router;
