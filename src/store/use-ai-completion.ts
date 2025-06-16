import * as React from 'react';
import {Editor} from 'codemirror';
import {Story, Passage} from './stories';

interface AICompletionOptions {
	enabled: boolean;
	apiKey?: string;
	model?: string;
	maxTokens?: number;
}

interface CompletionContext {
	story: Story;
	currentPassage: Passage;
	currentText: string;
	cursorPosition: number;
}

class AICompletionService {
	private static instance: AICompletionService;
	private options: AICompletionOptions;

	private constructor() {
		this.options = {
			enabled: false,
			model: 'gpt-3.5-turbo',
			maxTokens: 100
		};
	}

	static getInstance(): AICompletionService {
		if (!AICompletionService.instance) {
			AICompletionService.instance = new AICompletionService();
		}
		return AICompletionService.instance;
	}

	configure(options: Partial<AICompletionOptions>) {
		this.options = {...this.options, ...options};
	}

	async generateCompletion(context: CompletionContext): Promise<string | null> {
		if (!this.options.enabled) {
			console.log('AI completion disabled');
			return null;
		}
		
		if (!this.options.apiKey) {
			console.log('No API key provided');
			return null;
		}
		
		console.log('AI completion service options:', this.options);

		try {
			// Build context from the story
			const storyContext = this.buildStoryContext(context);
			const textBeforeCursor = context.currentText.substring(0, context.cursorPosition);
			const textAfterCursor = context.currentText.substring(context.cursorPosition);

			const prompt = this.buildPrompt(storyContext, textBeforeCursor, textAfterCursor);

			console.log('Making API call to OpenAI with prompt:', {
				storyContext: storyContext.substring(0, 200) + '...',
				textBeforeCursor: textBeforeCursor.substring(Math.max(0, textBeforeCursor.length - 50)),
				prompt: prompt.substring(0, 300) + '...'
			});

			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.options.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: this.options.model,
					messages: [
						{
							role: 'system',
							content: 'You are an AI writing assistant for interactive fiction. Provide natural, context-appropriate text completions that fit the story\'s tone and style. Keep completions concise and engaging.'
						},
						{
							role: 'user',
							content: prompt
						}
					],
					max_tokens: this.options.maxTokens,
					temperature: 0.7,
					stop: ['\n\n', '[[', ']]']
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('AI completion API error:', {
					status: response.status,
					statusText: response.statusText,
					errorText
				});
				return null;
			}

			const data = await response.json();
			console.log('OpenAI API response:', data);
			const result = data.choices?.[0]?.message?.content?.trim() || null;
			console.log('Extracted completion:', result);
			return result;
		} catch (error) {
			console.error('AI completion error:', error);
			return null;
		}
	}

	private buildStoryContext(context: CompletionContext): string {
		const {story, currentPassage} = context;
		
		// Get connected passages for context
		const linkedPassageNames = this.extractPassageLinks(currentPassage.text);
		const linkedPassages = story.passages.filter(p => 
			linkedPassageNames.includes(p.name) || p.name === story.startPassage
		);

		let storyContext = `Story Title: ${story.name}\n`;
		
		if (story.startPassage) {
			storyContext += `Start Passage: ${story.startPassage}\n`;
		}

		storyContext += `Current Passage: ${currentPassage.name}\n`;
		
		if (currentPassage.tags.length > 0) {
			storyContext += `Tags: ${currentPassage.tags.join(', ')}\n`;
		}

		// Add context from linked passages
		if (linkedPassages.length > 0) {
			storyContext += '\nRelated Passages:\n';
			linkedPassages.slice(0, 3).forEach(passage => {
				const excerpt = passage.text.substring(0, 200);
				storyContext += `- ${passage.name}: ${excerpt}${passage.text.length > 200 ? '...' : ''}\n`;
			});
		}

		return storyContext;
	}

	private buildPrompt(storyContext: string, textBefore: string, textAfter: string): string {
		return `Context:
${storyContext}

Current text being written:
"${textBefore}[CURSOR]${textAfter}"

Please provide a natural continuation from the [CURSOR] position that:
1. Fits the story's tone and style
2. Maintains narrative consistency
3. Is appropriate for interactive fiction
4. Is 1-3 sentences long

Only return the suggested text continuation, nothing else. Do not surround the text with quotes.`;
	}

	private extractPassageLinks(text: string): string[] {
		const linkRegex = /\[\[([^\]]+)\]\]/g;
		const links: string[] = [];
		let match;

		while ((match = linkRegex.exec(text)) !== null) {
			const linkText = match[1];
			// Handle both "Display Text|Passage Name" and "Passage Name" formats
			const passageName = linkText.includes('|') ? linkText.split('|')[1] : linkText;
			links.push(passageName.trim());
		}

		return links;
	}
}

export function useAICompletion(story: Story, passage: Passage) {
	const [isLoading, setIsLoading] = React.useState(false);
	const [currentSuggestion, setCurrentSuggestion] = React.useState<string | null>(null);
	const [suggestionPosition, setSuggestionPosition] = React.useState<{line: number, ch: number} | null>(null);
	const debounceRef = React.useRef<number>();
	const isShowingSuggestionRef = React.useRef(false);

	const service = React.useMemo(() => AICompletionService.getInstance(), []);

	const generateCompletion = React.useCallback(async (
		editor: Editor,
		triggerPosition?: {line: number, ch: number}
	) => {
		if (isLoading) return;

		const cursor = triggerPosition || editor.getCursor();
		const currentText = editor.getValue();
		const cursorIndex = editor.indexFromPos(cursor);

		console.log('generateCompletion called:', { 
			cursor, 
			textLength: currentText.length, 
			cursorIndex 
		});

		setIsLoading(true);
		
		try {
			const completion = await service.generateCompletion({
				story,
				currentPassage: passage,
				currentText,
				cursorPosition: cursorIndex
			});

			console.log('AI completion result:', completion);

			if (completion) {
				setCurrentSuggestion(completion);
				setSuggestionPosition(cursor);
				isShowingSuggestionRef.current = true;
				
				// Show the suggestion immediately in the editor
				if ((editor as any).showAISuggestion) {
					console.log('Showing AI suggestion in editor:', completion);
					(editor as any).showAISuggestion(completion, cursor);
				} else {
					console.warn('Editor does not have showAISuggestion method');
				}
			}
		} catch (error) {
			console.error('Completion generation failed:', error);
		} finally {
			setIsLoading(false);
		}
	}, [story, passage, service, isLoading]);

	const debouncedGenerateCompletion = React.useCallback((editor: Editor) => {
		// Don't generate completion if we're currently showing a suggestion
		console.log('debouncedGenerateCompletion called, isShowingSuggestion:', isShowingSuggestionRef.current);
		if (isShowingSuggestionRef.current) {
			console.log('Skipping AI completion - currently showing suggestion');
			return;
		}

		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		console.log('AI completion requested, debouncing...');
		debounceRef.current = window.setTimeout(() => {
			console.log('AI completion debounce complete, generating...');
			generateCompletion(editor);
		}, 1000); // Wait 1 second after user stops typing
	}, [generateCompletion]);

	const acceptSuggestion = React.useCallback((editor: Editor) => {
		console.log('acceptSuggestion called, resetting flag');
		isShowingSuggestionRef.current = false;
		console.log('Flag reset to false');
		if (currentSuggestion && suggestionPosition) {
			console.log('Accepting suggestion:', currentSuggestion);
			editor.replaceRange(currentSuggestion, suggestionPosition);
			setCurrentSuggestion(null);
			setSuggestionPosition(null);
		}
	}, [currentSuggestion, suggestionPosition]);

	const dismissSuggestion = React.useCallback(() => {
		console.log('dismissSuggestion called, resetting flag');
		isShowingSuggestionRef.current = false;
		setCurrentSuggestion(null);
		setSuggestionPosition(null);
	}, []);

	const configureService = React.useCallback((options: Partial<AICompletionOptions>) => {
		service.configure(options);
	}, [service]);

	React.useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	return {
		generateCompletion: debouncedGenerateCompletion,
		acceptSuggestion,
		dismissSuggestion,
		configureService,
		currentSuggestion,
		suggestionPosition,
		isLoading
	};
} 