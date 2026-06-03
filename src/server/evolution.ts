export const sendEvolutionMessage = async (number: string, text: string) => {
  const url = (process.env.EVOLUTION_API_URL || 'https://api.3dfans.pro').replace(/\/$/, '');
  const key = process.env.EVOLUTION_API_KEY || '3dfans123';
  const instance = process.env.EVOLUTION_INSTANCE || '3dfans';

  const response = await fetch(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      number: number,
      text: text,
      delay: 1200,
      linkPreview: false
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status} ${await response.text()}`);
  }
  return response.json();
};
