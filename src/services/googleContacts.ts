import { getAccessToken, initAuth, googleSignIn } from './auth';

export interface GoogleContact {
  names?: { displayName?: string; givenName?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
}

export const fetchGoogleContacts = async (): Promise<GoogleContact[]> => {
  let token = await getAccessToken();
  if (!token) {
    const result = await googleSignIn();
    if (result) {
      token = result.accessToken;
    } else {
      throw new Error('Não foi possível autenticar com o Google Contacts.');
    }
  }

  let allConnections: GoogleContact[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.append('personFields', 'names,phoneNumbers');
    url.searchParams.append('pageSize', '1000');
    if (pageToken) {
      url.searchParams.append('pageToken', pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Erro ao buscar contatos do Google: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.connections) {
      allConnections = allConnections.concat(data.connections);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allConnections;
};
