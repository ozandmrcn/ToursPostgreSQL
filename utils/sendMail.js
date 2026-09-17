const nodemailer = require("nodemailer");

/**
 * UTILITY: SEND EMAIL
 * Sends an email using Nodemailer and a configured SMTP transporter (e.g., Mailtrap).
 * @param {Object} options - Email options (to, subject, text, html).
 */
const sendMail = async (options) => {
  // 1) Create a transporter (SMTP configuration)
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // 2) Define the email content
  const mailOptions = {
    from: "Tourify Support <info@tourify.com>",
    to: options.email,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  // 3) Actually send the email
  await transporter.sendMail(mailOptions);
};

module.exports = sendMail;
