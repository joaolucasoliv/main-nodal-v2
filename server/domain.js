/**
 * @typedef {object} Profile
 * @property {string} id
 * @property {string=} preferred_name
 * @property {string=} full_name
 * @property {string=} email
 * @property {string=} avatar_url
 * @property {string=} city_region
 * @property {string=} country
 * @property {string[]=} languages
 * @property {string=} affiliation
 * @property {string=} bio
 * @property {string=} public_role
 */

/**
 * @typedef {object} ProfilePreferences
 * @property {string=} id
 * @property {string} user_id
 * @property {Record<string, unknown>} visibility
 * @property {Record<string, unknown>} notification_preferences
 * @property {Record<string, unknown>} data_consent
 */

/**
 * @typedef {object} OnboardingResponse
 * @property {string=} id
 * @property {string} user_id
 * @property {string[]} interests
 * @property {string[]} skills
 * @property {string[]} goals
 * @property {string[]} contribution_preferences
 * @property {string} availability
 * @property {string} mentoring_interest
 * @property {Record<string, unknown>} raw_answers
 */

/**
 * @typedef {object} Organization
 * @property {string} id
 * @property {string} name
 * @property {string=} type
 * @property {string=} website
 * @property {string=} city_region
 * @property {string=} country
 */

/**
 * @typedef {object} OrganizationMembership
 * @property {string} id
 * @property {string} organization_id
 * @property {string} user_id
 * @property {string=} role
 * @property {string=} status
 */

/**
 * @typedef {object} StripeCustomer
 * @property {string=} id
 * @property {string} user_id
 * @property {string=} stripe_customer_id
 * @property {string=} subscription_status
 * @property {string=} stripe_subscription_id
 */

export function defaultProfilePreferences(userId) {
  return {
    user_id: userId,
    visibility: { directory: false },
    notification_preferences: { dashboardRead: false },
    data_consent: { directoryPublic: false },
  };
}

export function defaultOnboardingResponse(userId) {
  return {
    user_id: userId,
    interests: [],
    skills: [],
    goals: [],
    contribution_preferences: [],
    availability: '',
    mentoring_interest: 'none',
    raw_answers: {},
  };
}

export function defaultStripeCustomer(userId) {
  return {
    user_id: userId,
    stripe_customer_id: '',
    subscription_status: 'pending',
    stripe_subscription_id: '',
  };
}
