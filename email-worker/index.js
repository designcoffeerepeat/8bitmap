// Forwards every email routed to this Worker to both inboxes.
// Each address must be a verified destination in Cloudflare Email Routing.
const INBOXES = ['8bitnyc@proton.me', 'martin+8bitnyc@3h-i.com'];

export default {
  async email(message) {
    for (const to of INBOXES) await message.forward(to);
  },
};
