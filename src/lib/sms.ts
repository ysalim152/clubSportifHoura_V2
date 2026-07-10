/**
 * SMS Service helper for Multi-Factor Authentication (MFA).
 * Consulates and executes real Twilio API calls when configured.
 * Otherwise, falls back gracefully to a secure simulation mode.
 */

interface SMSSendResult {
  success: boolean;
  error?: string;
  simulated: boolean;
  code?: string;
}

export async function sendMFACode(phoneNumber: string): Promise<SMSSendResult> {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
  
  // Access environment variables with any-casting for compiler compatibility
  const metaEnv = (import.meta as any).env || {};
  const accountSid = metaEnv.VITE_TWILIO_ACCOUNT_SID;
  const authToken = metaEnv.VITE_TWILIO_AUTH_TOKEN;
  const twilioPhone = metaEnv.VITE_TWILIO_PHONE_NUMBER;

  const hasConfig = accountSid && authToken && twilioPhone;

  if (!hasConfig) {
    console.info(`[SMS MFA Sandbox] Code de sécurité envoyé au ${phoneNumber} : ${code}`);
    return {
      success: true,
      simulated: true,
      code,
    };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const authString = btoa(`${accountSid}:${authToken}`);
    
    const bodyParams = new URLSearchParams();
    bodyParams.append('To', phoneNumber);
    bodyParams.append('From', twilioPhone);
    bodyParams.append('Body', `Votre code de double authentification HouraSports est : ${code}. Ne le partagez jamais.`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erreur Twilio HTTP ${response.status}`);
    }

    return {
      success: true,
      simulated: false,
      code,
    };
  } catch (error: any) {
    console.error("Erreur lors de l'envoi de l'SMS avec Twilio :", error);
    return {
      success: false,
      error: error.message || "Impossible de se connecter au service d'envoi d'SMS.",
      simulated: false,
    };
  }
}
