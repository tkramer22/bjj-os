import twilio from "twilio";

let connectionSettings: any;

// Get credentials from Replit Connector
async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Replit token not found. Please ensure the app is running in Replit environment.');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected via Replit Connector. Please set up Twilio integration in Replit.');
  }

  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  
  if (!phoneNumber) {
    throw new Error('Twilio phone number not configured in Replit Connector.');
  }
  
  return phoneNumber;
}

// Send SMS function
export async function sendSMS(to: string, message: string, statusCallback?: string) {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioPhoneNumber();

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
