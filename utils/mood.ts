export const getMoodCategory = (mood: string): string => {
    if (!mood || mood === 'N/A' || mood === 'any') return '';
    const lowerMood = mood.toLowerCase();
    
    if (['romantic', 'happy', 'joyful', 'loving', 'sweet', 'cheerful'].some(m => lowerMood.includes(m))) {
        return 'Romantic / Happy';
    }
    if (['motivational', 'energetic', 'powerful', 'upbeat', 'inspirational', 'epic'].some(m => lowerMood.includes(m))) {
        return 'Motivational / Energetic';
    }
    if (['lust', 'disgust', 'dark', 'intense', 'angry', 'seductive', 'rebellious'].some(m => lowerMood.includes(m))) {
        return 'Lust / Disgust';
    }
    if (['sad', 'melancholic', 'somber', 'heartbroken', 'gloomy', 'pensive'].some(m => lowerMood.includes(m))) {
        return 'Sad';
    }
    
    return 'Others';
};

export const mapEmotionToMoodCategory = (emotion: string): string => {
    const lowerEmotion = emotion.toLowerCase().trim();
    switch (lowerEmotion) {
        case 'joy':
            return 'Romantic / Happy';
        case 'anger':
        case 'surprise':
        case 'fear':
            return 'Motivational / Energetic';
        case 'disgust':
            return 'Lust / Disgust';
        case 'sadness':
            return 'Sad';
        case 'neutral':
            return 'Others';
        default:
            // If Gemini returns something unexpected, categorize it as 'Others'.
            return 'Others';
    }
};