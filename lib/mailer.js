import nodemailer from 'nodemailer'

const GMAIL_USER = 'harryphee010400@gmail.com'

export const REPORT_RECIPIENTS = [
  'harry.phillips@golfclubs4cash.co.uk',
  'Mike.Currie@golfclubs4cash.co.uk',
  'David.coles@golfclubs4cash.co.uk',
  'Connor.Wright@golfclubs4cash.co.uk',
  'kenny.price@golfclubs4cash.co.uk',
  'jack.goodger@golfclubs4cash.co.uk',
  'luke.horan@golfclubs4cash.co.uk',
  'Connor.Hamerston@golfclubs4cash.co.uk',
  'john.mantle@golfclubs4cash.co.uk',
  'martin.lambert@golfclubs4cash.co.uk',
  'murray.winton@golfclubs4cash.co.uk',
  'elliot.fleming@golfclubs4cash.co.uk',
]

export async function sendEmail({ to, subject, html }) {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
  await transport.sendMail({
    from: `"GC4C Reports" <${GMAIL_USER}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  })
}
