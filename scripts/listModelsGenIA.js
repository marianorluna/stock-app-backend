import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('❌ GEMINI_API_KEY no está configurada');
            return;
        }

        // Llamada directa a la API REST
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        console.log('\n📋 Modelos disponibles:\n');

        if (data.models && data.models.length > 0) {
            // Filtrar solo modelos que soporten generateContent
            const generateContentModels = data.models.filter(model =>
                model.supportedGenerationMethods?.includes('generateContent')
            );

            console.log('✅ Modelos que soportan generateContent:\n');
            for (const model of generateContentModels) {
                console.log(`- ${model.name}`);
                console.log(`  Display Name: ${model.displayName || 'N/A'}`);
                console.log(`  Descripción: ${model.description || 'N/A'}`);
                console.log('');
            }

            // También mostrar todos los modelos
            console.log('\n📋 Todos los modelos disponibles:\n');
            for (const model of data.models) {
                console.log(`- ${model.name}`);
                console.log(`  Métodos: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
                console.log('');
            }
        } else {
            console.log('No se encontraron modelos');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
}

listModels();