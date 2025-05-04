// emailAdminError.js
const notificationapi = require("notificationapi-node-server-sdk").default;

function emailAdminError(adminEmail, paymentType, bookingId) {
  // Add logging to debug environment variables
  console.log(
    "NOTIFICATIONAPI_CLIENT_ID exists:",
    !!process.env.NOTIFICATIONAPI_CLIENT_ID
  );
  console.log(
    "NOTIFICATIONAPI_CLIENT_SECRET exists:",
    !!process.env.NOTIFICATIONAPI_CLIENT_SECRET
  );

  if (
    !process.env.NOTIFICATIONAPI_CLIENT_ID ||
    !process.env.NOTIFICATIONAPI_CLIENT_SECRET
  ) {
    console.error(
      "Cannot send notification: Missing NotificationAPI credentials"
    );
    return; // Exit early but don't throw error
  }

  try {
    notificationapi.init(
      process.env.NOTIFICATIONAPI_CLIENT_ID,
      process.env.NOTIFICATIONAPI_CLIENT_SECRET,
      {
        baseURL: "https://api.ca.notificationapi.com",
      }
    );

    notificationapi.send({
      notificationId: "admin_payment_error",
      user: {
        id: adminEmail,
        email: adminEmail,
      },
      mergeTags: {
        type: paymentType,
        bookingId: bookingId,
      },
    });

    console.log(`Notification sent to ${adminEmail} successfully`);
  } catch (error) {
    console.error(`Failed to send notification to ${adminEmail}:`, error);
  }
}

// CommonJS export
module.exports = emailAdminError;
