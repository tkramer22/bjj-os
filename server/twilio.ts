import twilio from "twilio";

// Get credentials from environment variables (Replit Secrets)
function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio credentials not found in environment. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in Replit Secrets.');
  }

  return {
    accountSid,
    authToken,
    phoneNumber
  };
}

export function getTwilioClient() {
  const { accountSid, authToken } = getCredentials();
  return twilio(accountSid, authToken);
}

export function getTwilioPhoneNumber() {
  const { phoneNumber } = getCredentials();
  
  if (!phoneNumber) {
    throw new Error('Twilio phone number not configured in Replit Secrets.');
  }
  
  return phoneNumber;
}

// Send SMS function
export async function sendSMS(to: string, message: string, statusCallback?: string) {
  try {
    const client = getTwilioClient();
    const fromNumber = getTwilioPhoneNumber();

    console.log(`Attempting to send SMS to ${to} from ${fromNumber}`);

    const messageOptions: any = {
      body: message,
      from: fromNumber,
      to: to,
    };

    // Add status callback if provided
    if (statusCallback) {
      messageOptions.statusCallback = statusCallback;
    }

    const result = await client.messages.create(messageOptions);

    console.log(`SMS sent successfully! SID: ${result.sid}, Status: ${result.status}`);

    return {
      success: true,
      sid: result.sid,
      status: result.status,
    };
  } catch (error: any) {
    console.error("Failed to send SMS:", error.message);
    console.error("Full error:", error);
    return {
      success: false,
      error: error.message || "Failed to send SMS",
    };
  }
}
