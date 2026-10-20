// Forwards every email routed to this Worker to both inboxes.
// Each address must be a verified destination in Cloudflare Email Routing.
const INBOXES = ['8bitnyc@proton.me', 'martin+8bitnyc@3h-i.com', 'peter+8bitnyc@3h-i.com'];

export default {
  async email(message) {
    // One unverified or failing inbox shouldn't stop the others from getting their copy.
    const results = await Promise.allSettled(INBOXES.map((to) => message.forward(to)));
    results.forEach((r, i) => r.status === 'rejected' && console.error(`Forward to ${INBOXES[i]} failed:`, r.reason));
  },
};
