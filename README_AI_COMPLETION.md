# AI Auto-Completion for Twine.js

I've implemented an AI-powered auto-completion system for the passage writing experience in Twine.js. This feature provides intelligent, context-aware text suggestions that work similarly to code completion in IDEs.

## Features Implemented

### 1. Core AI Completion Service (`src/store/use-ai-completion.ts`)
- **Context-Aware Suggestions**: Uses story context including title, current passage, linked passages, and tags
- **Smart Debouncing**: Waits 1 second after user stops typing to generate suggestions
- **OpenAI Integration**: Supports GPT-3.5 Turbo, GPT-4, and GPT-4 Turbo models
- **Story Format Aware**: Understands Twine markup and stops suggestions at story format boundaries

### 2. Inline Suggestion Display (`src/codemirror/inline-suggestions.ts`)
- **Ghost Text Preview**: Shows suggestions as semi-transparent italic text inline
- **Tab to Accept**: Press Tab to accept the current suggestion
- **Escape to Dismiss**: Press Esc to dismiss suggestions
- **Tooltip with Instructions**: Shows a helpful tooltip with acceptance instructions
- **Auto-dismissal**: Suggestions automatically disappear after 30 seconds or when typing continues

### 3. Visual Styling (`src/components/control/code-area/ai-suggestions.css`)
- **Accessible Design**: Follows Twine's design system and supports dark mode
- **Reduced Motion Support**: Respects user's motion preferences
- **Clear Visual Hierarchy**: Distinguishes suggestions from actual text

### 4. User Preferences Integration
- **Preferences Storage**: AI completion settings are saved with user preferences
- **Settings in Preferences Dialog**: Toggle AI completion on/off in app preferences
- **API Key Management**: Secure storage of OpenAI API key
- **Model Selection**: Choose between different AI models
- **Customizable Length**: Adjust suggestion length (short/medium/long)

## How It Works

### Story Context Building
The AI system builds rich context from:
- **Story Title and Start Passage**: Provides narrative foundation
- **Current Passage**: Name, tags, and existing text
- **Linked Passages**: Content from passages referenced via `[[links]]`
- **Story Format**: Respects format-specific syntax

### Smart Suggestions
- **Narrative Consistency**: Maintains story tone and style
- **Interactive Fiction Appropriate**: Understands IF conventions
- **Length Control**: 1-3 sentences to avoid overwhelming users
- **Format Boundaries**: Stops at `[[`, `]]`, and other markup

### User Experience
1. **Enable in Preferences**: Turn on AI completion in app preferences
2. **Add API Key**: Enter your OpenAI API key securely
3. **Write Naturally**: Type story text as normal
4. **See Suggestions**: After pausing, see inline suggestions appear
5. **Accept or Dismiss**: Tab to accept, Esc to dismiss, or keep typing to ignore

## Technical Integration

### CodeMirror Integration
- **Seamless Integration**: Works with existing CodeMirror setup
- **Format Extensions Compatible**: Doesn't interfere with story format syntax highlighting
- **Performance Optimized**: Minimal impact on editor performance

### API Usage
- **Efficient Calls**: Only generates suggestions when helpful
- **Error Handling**: Graceful fallback when API is unavailable
- **Cost Conscious**: Configurable token limits to control costs

## Configuration Options

Users can configure:
- **Enable/Disable**: Toggle the feature on/off
- **API Key**: Secure storage of OpenAI credentials
- **AI Model**: Choose between GPT-3.5 Turbo, GPT-4, or GPT-4 Turbo
- **Suggestion Length**: Short (50 tokens), Medium (100 tokens), or Long (200 tokens)

## Privacy and Security

- **Local Storage**: API keys stored securely in user preferences
- **No Data Collection**: Story content only sent to OpenAI's API as needed
- **User Control**: Complete control over when and how the feature is used
- **Transparent**: Clear indication when AI suggestions are being generated

## Usage Example

```
User types: "The ancient door creaks open, revealing..."
AI suggests: "a chamber filled with floating crystals that pulse with an otherworldly blue light."
User presses Tab to accept, or Esc to dismiss, or continues typing to ignore.
```

The suggestion integrates seamlessly with the story context, understanding that this might be a fantasy adventure based on the existing story content.

## Future Enhancements

Potential improvements could include:
- **Local AI Models**: Support for local/offline AI models
- **Custom Prompts**: User-defined prompt templates
- **Genre-Specific Models**: Specialized models for different story genres
- **Collaborative Features**: Shared story context for multi-author projects

## Files Modified/Created

### New Files:
- `src/store/use-ai-completion.ts` - Core AI completion logic
- `src/codemirror/inline-suggestions.ts` - CodeMirror addon for inline suggestions
- `src/components/control/code-area/ai-suggestions.css` - Styling for suggestions

### Modified Files:
- `src/store/prefs/prefs.types.ts` - Added AI completion preferences
- `src/store/prefs/defaults.ts` - Default AI completion settings
- `src/components/control/code-area/code-area.tsx` - Integrated inline suggestions
- `src/dialogs/passage-edit/passage-text.tsx` - Connected AI completion to passage editor
- `src/dialogs/app-prefs.tsx` - Added preference controls

This implementation provides a seamless, intelligent writing assistant that enhances the Twine authoring experience while respecting user preferences and maintaining the tool's focus on interactive fiction creation. 