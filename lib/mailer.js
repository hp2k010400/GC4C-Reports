import nodemailer from 'nodemailer'

const GMAIL_USER = 'harryp010400@gmail.com'

// Grip email — weekly Monday 6am
export const GRIP_RECIPIENTS = [
  'harry.phillips@golfclubs4cash.co.uk',
  'john.mantle@golfclubs4cash.co.uk',
  'hamish.buist@golfclubs4cash.co.uk',
  'mike.currie@golfclubs4cash.co.uk',
  'david.coles@golfclubs4cash.co.uk',
  'connor.wright@golfclubs4cash.co.uk',
  'kenny.price@golfclubs4cash.co.uk',
  'jack.goodger@golfclubs4cash.co.uk',
  'luke.horan@golfclubs4cash.co.uk',
  'conner.hamerston@golfclubs4cash.co.uk',
  'martin.lambert@golfclubs4cash.co.uk',
  'murray.winton@golfclubs4cash.co.uk',
  'elliot.fleming@golfclubs4cash.co.uk',
]

// POS email — daily 7pm
export const POS_RECIPIENTS = [
  'harry.phillips@golfclubs4cash.co.uk',
  'john.mantle@golfclubs4cash.co.uk',
  'hamish.buist@golfclubs4cash.co.uk',
  'rob.hughes@golfclubs4cash.co.uk',
  // TODO: add store managers
]

// Legacy alias — remove once all callers updated
export const REPORT_RECIPIENTS = POS_RECIPIENTS

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
