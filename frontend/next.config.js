/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/SKILL.md',
        destination: 'https://raw.githubusercontent.com/tedkaczynski-the-bot/lobster-trap/main/skill/SKILL.md',
        permanent: false,
      },
      {
        source: '/HEARTBEAT.md',
        destination: 'https://raw.githubusercontent.com/tedkaczynski-the-bot/lobster-trap/main/skill/HEARTBEAT.md',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
