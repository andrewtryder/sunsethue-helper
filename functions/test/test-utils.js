function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createMockDb(initialState = {}) {
  const state = {
    locations: initialState.locations || [],
    runs: initialState.runs || [],
    locationUpdates: initialState.locationUpdates || []
  };

  const db = {
    state,
    collection(name) {
      if (name === "locations") {
        return {
          orderBy() {
            return {
              limit() {
                return {
                  async get() {
                    return {
                      forEach(fn) {
                        state.locations.forEach((location) => {
                          fn({
                            id: location.id,
                            data: () => {
                              const { id, ...data } = location;
                              return data;
                            }
                          });
                        });
                      }
                    };
                  }
                };
              }
            };
          },
          doc(id) {
            return {
              async update(data) {
                state.locationUpdates.push({ id, data });
                const location = state.locations.find((item) => item.id === id);
                if (location) {
                  Object.assign(location, data);
                }
              }
            };
          }
        };
      }

      if (name === "runs") {
        return {
          async add(data) {
            state.runs.push(data);
            return { id: String(state.runs.length) };
          }
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }
  };

  return db;
}

function createMockFetch(handlers = {}) {
  return async (url, options = {}) => {
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler(url, options);
      }
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
}

function createMockTransport() {
  const sentMessages = [];
  return {
    sentMessages,
    createTransport() {
      return {
        async sendMail(options) {
          sentMessages.push(options);
          return { messageId: "mock-message-id" };
        }
      };
    }
  };
}

const defaultEnv = {
  SUNSETHUE_API_KEY: "test-key",
  GMAIL_USER: "test@gmail.com",
  GMAIL_APP_PASSWORD: "test-password",
  EMAIL_TO: "test@gmail.com"
};

module.exports = {
  createMockResponse,
  createMockDb,
  createMockFetch,
  createMockTransport,
  defaultEnv
};
