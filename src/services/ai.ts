import axios from 'axios';
import { Contact } from '../types';

export type MessageType =
  | 'followup'
  | 'recuperacao'
  | 'promocao'
  | 'lancamento'
  | 'reativacao'
  | 'posvenda'
  | 'aniversario'
  | 'boasvindas';

export async function generateMessageVariations(
  tipo: MessageType,
  contato: Partial<Contact>,
  contexto?: string
): Promise<string[]> {
  try {
    const response = await axios.post('/api/generate', {
      tipo,
      contato: {
        nome: contato.nome,
        produto: contato.produto,
        interesse: contato.interesse,
      },
      contexto,
    });
    
    if (response.data?.variacoes && Array.isArray(response.data.variacoes)) {
      return response.data.variacoes;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error('Falha ao gerar mensagens com a IA.');
  }
}

export async function generateVariation(matriz: string, contato: Partial<Contact>, model?: string): Promise<string> {
  try {
    const response = await axios.post('/api/generate-variation', {
      matriz,
      contato: {
        nome: contato.nome,
        produto: contato.produto,
        interesse: contato.interesse,
      },
      model
    });
    
    if (response.data?.variacao) {
      return response.data.variacao;
    }
    throw new Error('Invalid response format');
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error('Falha ao gerar variação com a IA.');
  }
}
