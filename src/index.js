// Import required dependencies
const { createClient } = require("@supabase/supabase-js");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const emailAdminError = require("./emailAdminError");
const sendTippingNotification = require("./sendTippingNotification");

/**
 * Lambda function handler to scan Supabase for events and process payments
 *
 * @param {Object} event - The AWS Lambda event object
 * @param {Object} context - The AWS Lambda context object
 * @returns {Object} Response object containing status code and body
 */
exports.handler = async (event, context) => {
  try {
    console.log("==== ENVIRONMENT VARIABLE DEBUG ====");
    console.log(
      "NOTIFICATIONAPI_CLIENT_ID exists:",
      !!process.env.NOTIFICATIONAPI_CLIENT_ID
    );
    console.log(
      "NOTIFICATIONAPI_CLIENT_SECRET exists:",
      !!process.env.NOTIFICATIONAPI_CLIENT_SECRET
    );
    console.log("SUPABASE_URL exists:", !!process.env.SUPABASE_URL);
    console.log(
      "SUPABASE_SERVICE_ROLE_KEY exists:",
      !!process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    console.log("===============================");

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials in environment variables");
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing Stripe secret key in environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: adminData, error: adminError } = await supabase
      .from("admin_users")
      .select("*");

    if (adminError) {
      console.log(adminError);
    }

    // Get current date in ISO format (YYYY-MM-DD)
    const currentDate = new Date();

    // Calculate dates for one day before and after
    const oneDayBefore = new Date(currentDate);
    oneDayBefore.setDate(currentDate.getDate() - 1);

    const oneDayAfter = new Date(currentDate);
    oneDayAfter.setDate(currentDate.getDate() + 1);

    // Format dates as YYYY-MM-DD for Supabase query
    const beforeDateStr = oneDayBefore.toISOString().split("T")[0];
    const afterDateStr = oneDayAfter.toISOString().split("T")[0];
    const currentDateStr = currentDate.toISOString().split("T")[0];

    console.log(
      `Querying for events between ${beforeDateStr} and ${afterDateStr}`
    );

    // Query events happening one day before current date
    const { data: yesterdayEvents, error: yesterdayError } = await supabase
      .from("booking_requests")
      .select("*, customers(email), chefs(id, stripe_chef_id)")
      .eq("event_date", beforeDateStr);

    if (yesterdayError) {
      throw new Error(
        `Error querying yesterday's events: ${yesterdayError.message}`
      );
    }

    // Query events happening on current date
    const { data: todayEvents, error: todayError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("event_date", currentDateStr);

    if (todayError) {
      throw new Error(`Error querying today's events: ${todayError.message}`);
    }

    // Query events happening one day after current date
    const { data: tomorrowEvents, error: tomorrowError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("event_date", afterDateStr);

    if (tomorrowError) {
      throw new Error(
        `Error querying tomorrow's events: ${tomorrowError.message}`
      );
    }

    // Add error handling when creating the result object
    const result = {
      yesterdayEvents: yesterdayEvents || [],
      todayEvents: todayEvents || [],
      tomorrowEvents: tomorrowEvents || [],
      metadata: {
        yesterdayDate:
          beforeDateStr ||
          new Date(currentDate.getTime() - 86400000)
            .toISOString()
            .split("T")[0],
        todayDate: currentDateStr || new Date().toISOString().split("T")[0],
        tomorrowDate:
          afterDateStr ||
          new Date(currentDate.getTime() + 86400000)
            .toISOString()
            .split("T")[0],
        totalEvents:
          (yesterdayEvents?.length || 0) +
          (todayEvents?.length || 0) +
          (tomorrowEvents?.length || 0),
      },
    };

    // Business logic to handle these events
    console.log(`Found ${result.metadata.totalEvents} events in total`);

    // Process yesterday's events - Transfer payments to chefs and send tipping notifications
    if (yesterdayEvents.length > 0) {
      console.log(
        `Processing ${yesterdayEvents.length} events from yesterday for chef payments and customer notifications...`
      );

      // Log the structure of the first event for debugging
      if (yesterdayEvents.length > 0) {
        console.log(
          "Sample event structure:",
          JSON.stringify(
            {
              id: yesterdayEvents[0].id,
              payment_status: yesterdayEvents[0].payment_status,
              chef_id: yesterdayEvents[0].chef_id,
              chef_info: yesterdayEvents[0].chefs,
              has_chef_data: !!yesterdayEvents[0].chefs,
            },
            null,
            2
          )
        );
      }

      for (const booking of yesterdayEvents) {
        try {
          console.log(`Processing booking ID: ${booking.id}`);
          console.log(
            `Payment status: ${booking.payment_status}, Final customer paid: ${booking.final_customer_paid}, Chef paid: ${booking.final_chef_paid_amount}`
          );
          console.log(`Chef data available: ${!!booking.chefs}`);

          // Send tipping notification to customer if they exist
          if (booking.customers && booking.customers.email) {
            // Check if customer email exists
            const customerEmail = booking.customers.email;
            console.log(
              `Sending tipping notification to customer: ${customerEmail}`
            );

            try {
              // Send the tipping notification
              sendTippingNotification(customerEmail, booking.id);
              console.log(
                `Successfully sent tipping notification to ${customerEmail} for booking ${booking.id}`
              );
            } catch (notificationError) {
              console.error(
                `Error sending tipping notification to ${customerEmail} for booking ${booking.id}:`,
                notificationError
              );

              // Notify admins of the notification failure
              for (const admin of adminData) {
                emailAdminError(
                  admin.email,
                  "tipping_notification_failure",
                  booking.id
                );
              }
            }
          } else {
            console.log(
              `No customer email found for booking ${booking.id}, skipping tipping notification`
            );
          }

          // Skip if booking is not completed or final payment not made
          if (
            booking.payment_status !== "final_paid" ||
            !booking.final_customer_paid
          ) {
            console.log(
              `Skipping booking ${booking.id} - Payment not completed`
            );
            continue;
          }

          // Skip if chef has already been paid
          if (booking.final_chef_paid_amount) {
            console.log(`Skipping booking ${booking.id} - Chef already paid`);
            continue;
          }

          // Check if chef exists and has a Stripe account
          if (!booking.chefs) {
            console.log(
              `Skipping booking ${booking.id} - Chef data is missing`
            );

            continue;
          }

          if (
            !booking.chefs.stripe_chef_id ||
            !booking.chefs.stripe_chef_id.trim()
          ) {
            console.log(
              `Skipping booking ${booking.id} - Chef ${booking.chef_id} has no Stripe account`
            );

            continue;
          }

          const chefStripeId = booking.chefs.stripe_chef_id.trim();
          const chefName =
            booking.chefs.full_name || `Chef ID: ${booking.chef_id}`;

          console.log(
            `Processing payment for chef ${chefName} (${chefStripeId}) for booking ${booking.id}`
          );

          // Calculate chef's payment amount (total minus 12% fee)
          const totalAmount = Number(booking.total_price) || 0;
          const platformFeePercentage = 0.12; // 12%
          const platformFeeAmount = totalAmount * platformFeePercentage;
          const chefPaymentAmount = totalAmount - platformFeeAmount;

          // Safety check for valid amount
          if (isNaN(chefPaymentAmount) || chefPaymentAmount <= 0) {
            console.log(
              `Invalid chef payment amount (${chefPaymentAmount}) for booking ${booking.id}, skipping payment processing`
            );

            for (const admin of adminData) {
              emailAdminError(
                admin.email,
                "chef_transfer_invalid_amount",
                booking.id
              );
            }
            continue;
          }

          console.log(
            `Calculated chef payment: ${chefPaymentAmount} CAD (total: ${totalAmount}, fee: ${platformFeeAmount})`
          );

          // Create a charge that automatically transfers to the chef's connected account
          const charge = await stripe.charges.create({
            amount: Math.round(chefPaymentAmount * 100), // Convert to cents for Stripe
            currency: "cad",
            source: "tok_visa", // Use a test token in development, in production you'd use the customer's payment method
            transfer_data: {
              destination: chefStripeId,
            },
            description: `Payment for booking ${booking.id} on ${booking.event_date}`,
            metadata: {
              booking_id: booking.id,
              event_date: booking.event_date,
              chef_id: booking.chef_id,
              platform_fee_percentage: platformFeePercentage,
              platform_fee_amount: platformFeeAmount,
            },
          });

          console.log(`Transfer to chef successful. Charge ID: ${charge.id}`);

          // Update the booking record to indicate chef has been paid with the new field names
          const { data: updateData, error: updateError } = await supabase
            .from("booking_requests")
            .update({
              final_chef_paid: true,
              final_chef_paid_amount: chefPaymentAmount,
              final_transfer_id: charge.id,
            })
            .eq("id", booking.id);

          console.log(`Transfer to chef successful. Charge ID: ${charge.id}`);

          if (updateError) {
            console.error(
              `Error updating chef payment status for booking ${booking.id}: ${updateError.message}`
            );
          } else {
            console.log(
              `Successfully updated chef payment status for booking ${booking.id}`
            );
          }
        } catch (paymentError) {
          console.error(
            `Chef payment processing error for booking ${booking.id}:`,
            paymentError
          );

          for (const admin of adminData) {
            emailAdminError(admin.email, "chef_transfer_failure", booking.id);
          }

          if (error) {
            console.error(
              `Error updating failed chef payment status: ${error.message}`
            );
          }
        }
      }
    }

    // Process today's events
    if (todayEvents.length > 0) {
      console.log(`Processing ${todayEvents.length} events for today...`);

      // Example: Send reminders for today's events
      for (const event of todayEvents) {
        console.log(`Processing today's event: ${event.id}`);

        // You could send notifications here
        // Example:
        // await sendEventNotification(event, 'reminder');

        // For demo purposes, we'll just log what we would do
        console.log(`Would send reminder notification for event ${event.id}`);
      }
    }

    // Process tomorrow's events - Process payments
    if (tomorrowEvents.length > 0) {
      console.log(`Processing ${tomorrowEvents.length} events for tomorrow...`);

      // Process payments for tomorrow's events
      for (const booking of tomorrowEvents) {
        try {
          console.log(`Processing payment for booking: ${booking.id}`);

          // Calculate payment amount based on deposit status
          let paymentAmount;
          if (booking.deposit_paid === true) {
            // Ensure values are numbers and deposit_amount exists
            const totalPrice = Number(booking.total_price) || 0;
            const depositAmount = Number(booking.deposit_amount) || 0;
            paymentAmount = totalPrice - depositAmount;
            console.log(
              `Deposit was paid. Total: ${totalPrice}, Deposit: ${depositAmount}, Charging remaining amount: ${paymentAmount}`
            );
          } else {
            paymentAmount = Number(booking.total_price) || 0;
            console.log(
              `Deposit was not paid. Charging full amount: ${paymentAmount}`
            );
          }

          // Safety check for valid amount
          if (isNaN(paymentAmount) || paymentAmount <= 0) {
            console.log(
              `Invalid payment amount (${paymentAmount}) for booking ${booking.id}, skipping payment processing`
            );
            continue;
          }

          // Get the customer's Stripe ID from the customers table
          const { data: customerData, error: customerError } = await supabase
            .from("customers")
            .select("stripe_customer_id")
            .eq("id", booking.customer_id)
            .single();

          if (customerError || !customerData) {
            console.error(
              `Error getting customer data for ID ${booking.customer_id}: ${
                customerError?.message || "Customer not found"
              }`
            );
            continue;
          }

          const stripeCustomerId = customerData.stripe_customer_id;

          if (!stripeCustomerId) {
            console.error(
              `No Stripe customer ID found for customer ${booking.customer_id}`
            );

            for (const admin of adminData) {
              emailAdminError(
                admin.email,
                "customer_payment_method_missing",
                booking.id
              );
            }

            continue;
          }

          console.log(`Found Stripe customer ID: ${stripeCustomerId}`);

          // First retrieve the customer's payment methods
          const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: "card",
            limit: 1,
          });

          // Check if customer has any payment methods
          if (paymentMethods.data.length === 0) {
            console.log(
              `No payment methods found for customer ${stripeCustomerId}, skipping payment`
            );

            // Update booking to indicate payment method needed
            await supabase
              .from("booking_requests")
              .update({
                payment_status: "payment_method_required",
              })
              .eq("id", booking.id);

            continue;
          }

          // Use the first payment method
          const paymentMethodId = paymentMethods.data[0].id;
          console.log(`Using payment method: ${paymentMethodId}`);

          // Create the payment intent with the specific payment method
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(paymentAmount * 100), // Convert to cents for Stripe
            currency: "cad", // Update with your currency
            customer: stripeCustomerId,
            payment_method: paymentMethodId,
            description: `Final payment for booking ${booking.id}`,
            metadata: {
              booking_id: booking.id,
              event_date: booking.event_date,
            },
            confirm: true, // Confirm immediately
            off_session: true, // Customer not present
          });

          console.log(
            `Payment processed successfully for booking ${booking.id}. PaymentIntent ID: ${paymentIntent.id}`
          );

          // Update booking_requests table with payment status
          const { data: updateData, error: updateError } = await supabase
            .from("booking_requests")
            .update({
              payment_status: "final_paid",
              final_customer_paid: true,
            })
            .eq("id", booking.id);

          if (updateError) {
            console.error(
              `Error updating booking ${booking.id} status: ${updateError.message}`
            );
          } else {
            console.log(
              `Successfully updated payment status for booking ${booking.id}`
            );
          }
        } catch (paymentError) {
          console.error(
            `Payment processing error for booking ${booking.id}:`,
            paymentError
          );

          for (const admin of adminData) {
            emailAdminError(
              admin.email,
              "customer_payment_failure",
              booking.id
            );
          }

          // Record the failed payment attempt
          const { data, error } = await supabase
            .from("booking_requests")
            .update({
              payment_status: "final_payment_failed",
            })
            .eq("id", booking.id);

          if (error) {
            console.error(
              `Error updating failed payment status: ${error.message}`
            );
          }
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
