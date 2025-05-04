const notificationapi = require("notificationapi-node-server-sdk").default;

function sendTippingNotification(customerEmail, bookingId) {
  notificationapi.init(
    process.env.NOTIFICATIONAPI_CLIENT_ID,
    process.env.NOTIFICATIONAPI_CLIENT_SECRET,
    {
      baseURL: "https://api.ca.notificationapi.com",
    }
  );

  notificationapi.send({
    notificationId: "customer_tip_notification",
    user: {
      id: customerEmail,
      email: customerEmail,
    },
    mergeTags: {
      bookingId: bookingId,
    },
  });
}

module.exports = sendTippingNotification;
