import { useState, useEffect } from 'react';
import { subscribeToContacts, subscribeToContactMessages } from '../services/firestore';
import { Contact, Message } from '../types';

export const useContacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToContacts(
      (data) => {
        setContacts(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Erro ao carregar contatos.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { contacts, loading, error };
};

export const useContactMessages = (contactId: string | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) {
      setMessages([]);
      return;
    }
    
    setLoading(true);
    const unsubscribe = subscribeToContactMessages(
      contactId,
      (data) => {
        setMessages(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Erro ao carregar mensagens.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [contactId]);

  return { messages, loading, error };
};
