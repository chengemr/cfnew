export class SubscriptionCompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubscriptionCompatibilityError';
    this.status = 422;
  }
}
