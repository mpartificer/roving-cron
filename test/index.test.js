const { handler } = require("../src/index");

// Mock the Stripe module
jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    paymentMethods: {
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: "pm_test_12345",
            type: "card",
            card: { last4: "4242" },
          },
        ],
      }),
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: "pi_test_12345",
        status: "succeeded",
      }),
    },
    transfers: {
      create: jest.fn().mockResolvedValue({
        id: "tr_test_12345",
        amount: 5000,
        currency: "cad",
        destination: "acct_test_12345",
      }),
    },
  }));
});

// Mock the Supabase client
jest.mock("@supabase/supabase-js", () => {
  return {
    createClient: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockImplementation((column, value) => {
            // Return different mock data based on the date
            let mockEvents = [];

            if (column === "event_date") {
              const currentDate = new Date();
              const yesterdayDate = new Date(currentDate);
              yesterdayDate.setDate(currentDate.getDate() - 1);
              const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

              if (value === yesterdayStr) {
                // Yesterday's events with chef data
                mockEvents = [
                  {
                    id: 1,
                    event_date: value,
                    title: `Test Event 1 on ${value}`,
                    status: "confirmed",
                    payment_status: "final_paid",
                    final_customer_paid: true,
                    chef_paid: false,
                    total_price: 100,
                    chef_id: 101,
                    customer_id: 201,
                    created_at: new Date().toISOString(),
                    chefs: {
                      id: 101,
                      stripe_chef_id: "acct_test_chef1",
                      full_name: "Chef Test One",
                    },
                    customers: {
                      email: "customer1@example.com",
                    },
                  },
                  {
                    id: 2,
                    event_date: value,
                    title: `Test Event 2 on ${value}`,
                    status: "confirmed",
                    payment_status: "final_paid",
                    final_customer_paid: true,
                    chef_paid: true, // Already paid
                    total_price: 150,
                    chef_id: 102,
                    customer_id: 202,
                    created_at: new Date().toISOString(),
                    chefs: {
                      id: 102,
                      stripe_chef_id: "acct_test_chef2",
                      full_name: "Chef Test Two",
                    },
                    customers: {
                      email: "customer2@example.com",
                    },
                  },
                  {
                    id: 3,
                    event_date: value,
                    title: `Test Event 3 on ${value}`,
                    status: "confirmed",
                    payment_status: "pending",
                    final_customer_paid: false, // Not paid yet
                    chef_paid: false,
                    total_price: 200,
                    chef_id: 103,
                    customer_id: 203,
                    created_at: new Date().toISOString(),
                    chefs: {
                      id: 103,
                      stripe_chef_id: "acct_test_chef3",
                      full_name: "Chef Test Three",
                    },
                    customers: {
                      email: "customer3@example.com",
                    },
                  },
                ];
              } else {
                // Other dates get generic mock data
                for (let i = 1; i <= 3; i++) {
                  mockEvents.push({
                    id: i + 10,
                    event_date: value,
                    title: `Test Event ${i} on ${value}`,
                    status: "confirmed",
                    created_at: new Date().toISOString(),
                  });
                }
              }
            }

            return Promise.resolve({
              data: mockEvents,
              error: null,
            });
          }),
        })),
        update: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({
            data: { success: true },
            error: null,
          }),
        })),
      })),
    })),
  };
});

// Spy on console.log
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation();
  jest.spyOn(console, "error").mockImplementation();

  // Set environment variables for testing
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

describe("Supabase Event Scanner Lambda", () => {
  test("should fetch events for yesterday, today, and tomorrow", async () => {
    // Arrange
    const event = {};
    const context = {};

    // Act
    const result = await handler(event, context);
    const body = JSON.parse(result.body);

    // Assert
    expect(result.statusCode).toBe(200);
    expect(body).toHaveProperty("yesterdayEvents");
    expect(body).toHaveProperty("todayEvents");
    expect(body).toHaveProperty("tomorrowEvents");
    expect(body).toHaveProperty("metadata");

    // Verify console output
    expect(console.log).toHaveBeenCalled();
  });

  test("should handle missing environment variables", async () => {
    // Arrange
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Act
    const result = await handler({}, {});

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain(
      "Missing Supabase credentials"
    );
  });

  test("should calculate correct dates", async () => {
    // Arrange
    const event = {};
    const mockDate = new Date("2023-01-15T12:00:00Z");
    const realDate = Date;

    // Mock the Date constructor
    global.Date = class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate;
        }
        return new realDate(...args);
      }

      static now() {
        return mockDate.getTime();
      }
    };

    // Act
    const result = await handler(event, {});
    const body = JSON.parse(result.body);

    // Assert
    expect(body.metadata.yesterdayDate).toBe("2023-01-14");
    expect(body.metadata.todayDate).toBe("2023-01-15");
    expect(body.metadata.tomorrowDate).toBe("2023-01-16");

    // Restore original Date
    global.Date = realDate;
  });

  test("should process chef payments for yesterday's events", async () => {
    // Arrange
    const event = {};
    const context = {};

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toBe(200);

    // Verify console output for chef payment processing
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Processing payment for chef")
    );

    // We should see the calculation log for the first booking that needs payment
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Calculated chef payment")
    );

    // We should see a transfer successful message
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Transfer to chef successful")
    );

    // And an update success message
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Successfully updated chef payment status")
    );

    // But we should also see a skip message for the pre-paid chef
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Skipping booking 2 - Chef already paid")
    );

    // And a skip message for the booking without payment
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Skipping booking 3 - Payment not completed")
    );
  });
});
