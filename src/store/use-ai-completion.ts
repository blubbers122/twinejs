import * as React from 'react';
import {Editor} from 'codemirror';
import {Story, Passage} from './stories/stories.types';

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
			model: 'o4-mini',
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

			// Adjust for word boundaries to handle incomplete words properly
			const adjustedContext = this.adjustForWordBoundaries(textBeforeCursor, textAfterCursor);
			
			const prompt = this.buildPrompt(storyContext, adjustedContext.textBefore, adjustedContext.textAfter, adjustedContext.incompleteWord, adjustedContext.isInPassageLink, adjustedContext.passageLinkContext);

			console.log('Making API call to OpenAI with prompt:', {
				storyContext: storyContext.substring(0, 200) + '...',
				textBeforeCursor: adjustedContext.textBefore.substring(Math.max(0, adjustedContext.textBefore.length - 50)),
				incompleteWord: adjustedContext.incompleteWord,
				prompt: prompt//prompt.substring(0, 300) + '...'
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
					temperature: 0.9,
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
			let result = data.choices?.[0]?.message?.content?.trim() || null;
			
			// Clean up the result by removing quotes and other unwanted formatting
			if (result) {
				result = this.cleanupSuggestion(result);
			}
			
			console.log('Extracted completion:', result);
			return result;
		} catch (error) {
			console.error('AI completion error:', error);
			return null;
		}
	}

	private buildStoryContext(context: CompletionContext): string {
		const {story, currentPassage} = context;
		// Get the path from start to current passage
		const path = this.findPathToPassage(story, currentPassage);
		let storyContext = `Story Title: ${story.name}\n`;
		if (story.startPassage) {
			storyContext += `Start Passage: ${story.startPassage}\n`;
		}
		// Add previous passages in the path (excluding current)
		if (path && path.length > 1) {
			const prev: Passage[] = path.slice(0, -1).slice(-3); // up to 3 previous
			storyContext += `\nPrevious Passages (in order):\n`;
			prev.forEach((passage: Passage) => {
				const excerpt = (passage.text || '').substring(0, 200);
				storyContext += `- ${passage.name}: ${excerpt}${(passage.text && passage.text.length > 200) ? '...' : ''}\n`;
			});
		}
		// Indicate that the current passage title is the decision made
		storyContext += `\nNOTE: The title of the current passage ('${currentPassage.name}') represents the decision or choice that was made to reach this point. The continuation should be consistent with that decision.\n`;
		storyContext += `Current Passage: ${currentPassage.name}\n`;
		if (currentPassage.tags.length > 0) {
			storyContext += `Tags: ${currentPassage.tags.join(', ')}\n`;
		}
		// Add context from linked passages (as before)
		const linkedPassageNames = this.extractPassageLinks(currentPassage.text);
		const linkedPassages = story.passages.filter((p: Passage) => 
			linkedPassageNames.includes(p.name) || p.name === story.startPassage
		);
		if (linkedPassages.length > 0) {
			storyContext += '\nRelated Passages:\n';
			linkedPassages.slice(0, 3).forEach((passage: Passage) => {
				const excerpt = passage.text.substring(0, 200);
				storyContext += `- ${passage.name}: ${excerpt}${passage.text.length > 200 ? '...' : ''}\n`;
			});
		}
		return storyContext;
	}

	private buildPrompt(storyContext: string, textBefore: string, textAfter: string, incompleteWord?: string, isInPassageLink?: boolean, passageLinkContext?: string): string {
		let promptText = `Context:
${storyContext}

Current text being written:
"${textBefore}[CURSOR]${textAfter}"`;

		if (isInPassageLink) {
			if (passageLinkContext && passageLinkContext.trim().length > 0) {
				promptText += `

Note: The user is typing inside a passage link [[${passageLinkContext}]] and has started the passage name "${passageLinkContext}". Please complete this passage name to create a logical choice/decision for the reader. The completion should:
- Continue naturally from "${passageLinkContext}"
- Create a short, descriptive passage name (2-4 words total)
- Represent a meaningful choice or action the reader can take
- Fit naturally with the story's current situation`;
			} else {
				promptText += `

Note: The user is typing inside a passage link [[]] at the cursor position. Please suggest a passage name that would be a logical choice/decision for the reader based on the current story context. The suggestion should be:
- A short, descriptive passage name (2-4 words)
- Represent a meaningful choice or action the reader can take
- Fit naturally with the story's current situation
- Be written as a clear decision or destination`;
			}
		} else if (incompleteWord) {
			promptText += `

Note: The user has started typing the word "${incompleteWord}" at the cursor position. Please provide a completion that starts with this word completed naturally, followed by the rest of the sentence.`;
		}

		if (isInPassageLink) {
			if (passageLinkContext && passageLinkContext.trim().length > 0) {
				promptText += `

Please provide only the completion of the passage name (continuing from "${passageLinkContext}"), without the [[ ]] brackets. Do not repeat the text that's already there.`;
			} else {
				promptText += `

Please provide only a passage name suggestion (without the [[ ]] brackets), nothing else.`;
			}
		} else {
			promptText += `

Please provide a natural continuation from the [CURSOR] position that:
1. Fits the story's tone and style
2. Maintains narrative consistency
3. Is appropriate for interactive fiction
4. Is up to 2 sentences long`;

			if (incompleteWord) {
				promptText += `
5. Starts by completing the word "${incompleteWord}" naturally`;
			}

			promptText += `

Only return the suggested text continuation, nothing else. Do not surround the text with quotes.`;
		}

		return promptText;
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

	private adjustForWordBoundaries(textBefore: string, textAfter: string): {textBefore: string, textAfter: string, incompleteWord?: string, isInPassageLink?: boolean, passageLinkContext?: string} {
		// Check if we're inside a passage link [[...]]
		const passageLinkMatch = this.detectPassageLinkContext(textBefore);
		if (passageLinkMatch) {
			console.log('Detected passage link context:', passageLinkMatch);
			return {
				textBefore,
				textAfter,
				isInPassageLink: true,
				passageLinkContext: passageLinkMatch.partialName
			};
		}

		// Check if we're in the middle of a word
		const wordBoundaryRegex = /\s/;
		
		// If the text before cursor doesn't end with whitespace and there's more text,
		// we might be in the middle of a word
		if (textBefore.length > 0 && !wordBoundaryRegex.test(textBefore[textBefore.length - 1])) {
			// Find the start of the current incomplete word
			let wordStart = textBefore.length - 1;
			while (wordStart > 0 && !wordBoundaryRegex.test(textBefore[wordStart - 1])) {
				wordStart--;
			}
			
			// Extract the incomplete word
			const incompleteWord = textBefore.substring(wordStart);
			
			// Only adjust if the incomplete word is reasonable (not too long, contains letters)
			if (incompleteWord.length > 0 && incompleteWord.length <= 20 && /[a-zA-Z]/.test(incompleteWord)) {
				console.log('Detected incomplete word:', incompleteWord);
				
				// Adjust the context to end at the word boundary
				const adjustedTextBefore = textBefore.substring(0, wordStart);
				
				// Add the incomplete word to the prompt context but not as part of the completion
				return {
					textBefore: adjustedTextBefore,
					textAfter: textAfter,
					incompleteWord
				};
			}
		}
		
		// No adjustment needed
		return {
			textBefore,
			textAfter
		};
	}

	private detectPassageLinkContext(textBefore: string): {partialName: string, linkStart: number} | null {
		// Look for an open [[ before the cursor
		const beforeCursor = textBefore;
		let linkStart = -1;
		
		// Find the last [[ that doesn't have a matching ]]
		for (let i = beforeCursor.length - 1; i >= 1; i--) {
			if (beforeCursor[i - 1] === '[' && beforeCursor[i] === '[') {
				// Found [[, now check if there's a closing ]] before the cursor
				const afterLinkStart = beforeCursor.substring(i + 1);
				if (!afterLinkStart.includes(']]')) {
					linkStart = i + 1;
					break;
				}
			}
		}
		
		if (linkStart === -1) return null;
		
		// Extract the partial passage name
		const partialName = beforeCursor.substring(linkStart);
		
		// Make sure we're not after a closing ]]
		if (partialName.includes(']]')) return null;
		
		return {
			partialName,
			linkStart
		};
	}

	private cleanupSuggestion(suggestion: string): string {
		let cleaned = suggestion.trim();
		
		// Remove surrounding quotes (single or double)
		if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
			(cleaned.startsWith("'") && cleaned.endsWith("'"))) {
			cleaned = cleaned.slice(1, -1).trim();
		}
		
		// Remove any remaining quotes at the beginning or end
		cleaned = cleaned.replace(/^["']|["']$/g, '');
		
		// Remove any markdown formatting that might have snuck in
		cleaned = cleaned.replace(/^\*\*|\*\*$/g, ''); // Bold
		cleaned = cleaned.replace(/^\*|\*$/g, ''); // Italic
		cleaned = cleaned.replace(/^`|`$/g, ''); // Code
		
		// Remove any leading/trailing brackets that aren't part of the content
		if (cleaned.startsWith('[') && cleaned.endsWith(']') && !cleaned.includes('[[')) {
			cleaned = cleaned.slice(1, -1).trim();
		}
		
		// Clean up any extra whitespace
		cleaned = cleaned.replace(/\s+/g, ' ').trim();
		
		return cleaned;
	}

	// Helper: Find a plausible path from the start passage to the current passage by following links
	private findPathToPassage(story: Story, targetPassage: Passage): Passage[] | null {
		// Build a map from passage name to passage
		const passageMap = new Map<string, Passage>(story.passages.map((p: Passage) => [p.name, p]));
		// Find the start passage (by id or name)
		const startPassage = story.passages.find((p: Passage) => p.id === story.startPassage || p.name === story.startPassage);
		if (!startPassage) return null;
		// BFS to find a path
		const queue: Passage[][] = [[startPassage]];
		const visited = new Set<string>();
		while (queue.length > 0) {
			const path = queue.shift();
			if (!path) continue;
			const last = path[path.length - 1];
			if (!last) continue;
			if (last.id === targetPassage.id) return path;
			visited.add(last.id);
			// Get linked passage names
			const links = (typeof last.text === 'string') ? (last.text.match(/\[\[([^\]]+)\]\]/g) || []).map((l: string) => {
				// Remove brackets and extract passage name
				const inner = l.slice(2, -2);
				// Handle display|name and display->name, etc.
				if (inner.includes('->')) return inner.split('->').pop()?.trim() || '';
				if (inner.includes('<-')) return inner.split('<-')[0].trim();
				if (inner.includes('|')) return inner.split('|').pop()?.trim() || '';
				return inner.trim();
			}) : [];
			for (const name of links) {
				const next = passageMap.get(name);
				if (next && !visited.has(next.id)) {
					queue.push([...path, next]);
				}
			}
		}
		return null;
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