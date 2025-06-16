import CodeMirror from 'codemirror';
import {Editor} from 'codemirror';

interface InlineSuggestion {
	text: string;
	from: CodeMirror.Position;
	to: CodeMirror.Position;
}

let currentSuggestion: InlineSuggestion | null = null;
let suggestionWidget: CodeMirror.LineWidget | null = null;
let ghostTextMarker: CodeMirror.TextMarker | null = null;

export interface CMInlineSuggestionsOptions {
	enabled?: boolean;
	onAccept?: (suggestion: string, editor: Editor) => void;
	onDismiss?: () => void;
}

function createSuggestionElement(text: string): HTMLElement {
	const element = document.createElement('div');
	element.className = 'ai-suggestion-preview';
	element.innerHTML = `
		<div class="ai-suggestion-text">${text}</div>
		<div class="ai-suggestion-hint">Press Tab to accept, Esc to dismiss</div>
	`;
	return element;
}

function showInlineSuggestion(editor: Editor, text: string, position: CodeMirror.Position) {
	console.log('showInlineSuggestion called:', { text, position });
	clearSuggestion();

	// Create ghost text marker for inline preview
	const ghostText = document.createElement('span');
	ghostText.className = 'ai-suggestion-ghost';
	ghostText.textContent = text;
	
	// Style as subtle ghost text
	ghostText.style.opacity = '0.5';
	ghostText.style.fontStyle = 'italic';
	ghostText.style.color = '#888';
	ghostText.style.backgroundColor = 'transparent';
	
	console.log('Created ghost text element:', ghostText);

	// Insert ghost text at cursor position using bookmark widget
	try {
		ghostTextMarker = editor.setBookmark(position, {
			widget: ghostText,
			insertLeft: false
		});
		console.log('Created ghost text marker:', ghostTextMarker);
		
		// Force refresh to ensure the widget is displayed
		editor.refresh();
	} catch (error) {
		console.error('Error creating ghost text marker:', error);
	}

	// Create tooltip widget
	const suggestionElement = createSuggestionElement(text);
	console.log('Created suggestion element:', suggestionElement);
	
	suggestionWidget = editor.addLineWidget(position.line, suggestionElement, {
		coverGutter: false,
		noHScroll: true,
		above: false,
		showIfHidden: false
	});
	
	console.log('Added line widget:', suggestionWidget);

	currentSuggestion = {
		text,
		from: position,
		to: position
	};

	console.log('Set current suggestion:', currentSuggestion);

	// Auto-dismiss after 30 seconds
	setTimeout(() => {
		if (currentSuggestion) {
			console.log('Auto-dismissing suggestion after 30 seconds');
			clearSuggestion();
		}
	}, 30000);
}

function clearSuggestion() {
	if (suggestionWidget) {
		suggestionWidget.clear();
		suggestionWidget = null;
	}

	if (ghostTextMarker) {
		ghostTextMarker.clear();
		ghostTextMarker = null;
	}

	currentSuggestion = null;
}

function acceptSuggestion(editor: Editor, options: CMInlineSuggestionsOptions) {
	if (currentSuggestion) {
		const {text, from} = currentSuggestion;
		editor.replaceRange(text, from);
		
		// Move cursor to end of inserted text
		const newPosition = {
			line: from.line,
			ch: from.ch + text.length
		};
		editor.setCursor(newPosition);

		clearSuggestion();
		options.onAccept?.(text, editor);
	}
}

function dismissSuggestion(editor: Editor, options: CMInlineSuggestionsOptions) {
	console.log('dismissSuggestion called in inline suggestions');
	if (currentSuggestion) {
		clearSuggestion();
		console.log('Calling onDismiss callback');
		options.onDismiss?.();
	}
}

export function inlineSuggestionsOption(
	editor: Editor,
	options: CMInlineSuggestionsOptions
) {
	console.log('inlineSuggestionsOption called with:', options);
	
	if (!options.enabled) {
		console.log('Inline suggestions disabled, clearing...');
		clearSuggestion();
		return;
	}
	
	console.log('Setting up inline suggestions for editor...');

	// Handle key events
	editor.on('keydown', (instance: Editor, event: KeyboardEvent) => {
		if (!currentSuggestion) return;

		if (event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			acceptSuggestion(editor, options);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			dismissSuggestion(editor, options);
		} else if (
			event.key !== 'ArrowLeft' && 
			event.key !== 'ArrowRight' && 
			event.key !== 'ArrowUp' && 
			event.key !== 'ArrowDown'
		) {
			// Clear suggestion on any other key press
			console.log('Clearing suggestion due to key press:', event.key);
			dismissSuggestion(editor, options);
		}
	});

	// Clear suggestion when cursor moves
	editor.on('cursorActivity', () => {
		if (currentSuggestion) {
			const cursor = editor.getCursor();
			if (cursor.line !== currentSuggestion.from.line || 
				cursor.ch !== currentSuggestion.from.ch) {
				console.log('Clearing suggestion due to cursor movement');
				dismissSuggestion(editor, options);
			}
		}
	});

	// Clear suggestion on blur
	editor.on('blur', () => {
		console.log('Clearing suggestion due to blur');
		dismissSuggestion(editor, options);
	});

	// Store reference to functions on editor for external access
	(editor as any).showAISuggestion = (text: string, position?: CodeMirror.Position) => {
		const pos = position || editor.getCursor();
		showInlineSuggestion(editor, text, pos);
	};

	(editor as any).clearAISuggestion = () => {
		clearSuggestion();
	};

	(editor as any).acceptAISuggestion = () => {
		acceptSuggestion(editor, options);
	};

	(editor as any).dismissAISuggestion = () => {
		dismissSuggestion(editor, options);
	};
}

let inited = false;

export function initInlineSuggestionsGlobally() {
	if (!inited) {
		console.log('Initializing inline suggestions globally...');
		CodeMirror.defineOption('inlineSuggestions', {enabled: false}, inlineSuggestionsOption);
		inited = true;
		console.log('Inline suggestions initialized');
	}
} 