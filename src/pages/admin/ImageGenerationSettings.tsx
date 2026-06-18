import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { serverDb } from '../../lib/firebase'; // Adjust path as needed
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { Switch } from "../../../components/ui/switch";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card";

const ImageGenerationSettings = () => {
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState('gemini-2.5-flash-image-preview');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const configRef = doc(serverDb, 'ai_config', 'image_generation');
    const unsubscribe = onSnapshot(configRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setEnabled(data.enabled);
        setModel(data.model);
        setPrompt(data.prompt);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configRef = doc(serverDb, 'ai_config', 'image_generation');
      await setDoc(configRef, { enabled, model, prompt }, { merge: true });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      alert('Falha ao salvar as configurações.');
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Geração de Imagem</CardTitle>
          <CardDescription>
            Configure o modelo de IA e o prompt para a geração automática de previews.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              id="generation-enabled"
            />
            <label htmlFor="generation-enabled" className="text-lg font-medium">
              {enabled ? 'Geração Automática Ativada' : 'Geração Automática Desativada'}
            </label>
          </div>

          <div className="space-y-2">
            <label htmlFor="model-input" className="block text-sm font-medium text-gray-700">
              Modelo de IA
            </label>
            <Input
              id="model-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="ex: gemini-2.5-flash-image-preview"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="prompt-textarea" className="block text-sm font-medium text-gray-700">
              Prompt de Geração
            </label>
            <Textarea
              id="prompt-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva como a IA deve transformar a imagem do cliente..."
              rows={10}
            />
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImageGenerationSettings;
