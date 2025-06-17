import * as React from 'react';
import {ButtonBar} from '../../../../components/container/button-bar';
import {RenamePassageButton} from '../../../../components/passage/rename-passage-button';
import {
	Passage,
	Story,
	updatePassage,
	useStoriesContext
} from '../../../../store/stories';
import {Point} from '../../../../util/geometry';
import {CreatePassageButton} from './create-passage-button';
import {DeletePassagesButton} from './delete-passages-button';
import {EditPassagesButton} from './edit-passages-buttons';
import {GoToPassageButton} from './go-to-passage-button';
import {SelectAllPassagesButton} from './select-all-passages-button';
import {DeselectAllPassagesButton} from './deselect-all-passages-button';
import {StartAtPassageButton} from './start-at-passage-button';
import {TestPassageButton} from './test-passage-button';
import {IconButton} from '../../../../components/control/icon-button';

export interface PassageActionsProps {
	getCenter: () => Point;
	onOpenFuzzyFinder: () => void;
	story: Story;
}

export const PassageActions: React.FC<PassageActionsProps> = props => {
	const {getCenter, onOpenFuzzyFinder, story} = props;
	const {dispatch} = useStoriesContext();
	const selectedPassages = React.useMemo(
		() => story.passages.filter(passage => passage.selected),
		[story.passages]
	);
	const soloSelectedPassage = React.useMemo(
		() => (selectedPassages.length === 1 ? selectedPassages[0] : undefined),
		[selectedPassages]
	);

	function handleRename(name: string, passage?: Passage) {
		if (!passage) {
			throw new Error('Passage is unset');
		}

		// Don't create newly linked passages here because the update action will
		// try to recreate the passage as it's been renamed--it sees new links in
		// existing passages, updates them, but does not see that the passage name
		// has been updated since that hasn't happened yet.

		dispatch(updatePassage(story, passage, {name}, {dontUpdateOthers: true}));
	}

	function arrangePassages() {
		// Simple BFS tree layout: each level is a row, siblings are spaced horizontally
		const passageMap = new Map(story.passages.map(p => [p.id, p]));
		const nameMap = new Map(story.passages.map(p => [p.name, p]));
		const start = story.passages.find(p => p.id === story.startPassage || p.name === story.startPassage);
		if (!start) return;
		const visited = new Set();
		const levels: string[][] = [];
		const queue: {id: string, level: number}[] = [{id: start.id, level: 0}];
		while (queue.length > 0) {
			const {id, level} = queue.shift()!;
			if (visited.has(id)) continue;
			visited.add(id);
			if (!levels[level]) levels[level] = [];
			levels[level].push(id);
			const passage = passageMap.get(id);
			if (!passage) continue;
			const links = (passage.text.match(/\[\[([^\]]+)\]\]/g) || []).map((l: string) => {
				const inner = l.slice(2, -2);
				if (inner.includes('->')) return inner.split('->').pop()?.trim() || '';
				if (inner.includes('<-')) return inner.split('<-')[0].trim();
				if (inner.includes('|')) return inner.split('|').pop()?.trim() || '';
				return inner.trim();
			});
			for (const name of links) {
				const target = nameMap.get(name);
				if (target && !visited.has(target.id)) {
					queue.push({id: target.id, level: level + 1});
				}
			}
		}
		// Layout: each level is a row, siblings spaced horizontally
		// Keep the starting passage in its current position and arrange others relative to it
		const xSpacing = 250, ySpacing = 180;
		const startX = start.left;
		const startY = start.top;
		const updates: Record<string, Partial<Passage>> = {};
		
		levels.forEach((ids, row) => {
			if (row === 0) {
				// Don't move the starting passage - keep it at its current position
				return;
			}
			
			const totalWidth = (ids.length - 1) * xSpacing;
			ids.forEach((id, col) => {
				const passage = passageMap.get(id);
				if (!passage) return;
				updates[id] = {
					left: Math.round(startX + col * xSpacing - totalWidth / 2),
					top: Math.round(startY + row * ySpacing)
				};
			});
		});
		
		dispatch({
			type: 'updatePassages',
			passageUpdates: updates,
			storyId: story.id
		});
	}

	return (
		<ButtonBar>
			<CreatePassageButton getCenter={getCenter} story={story} />
			<EditPassagesButton passages={selectedPassages} story={story} />
			<RenamePassageButton
				onRename={name => handleRename(name, soloSelectedPassage)}
				passage={soloSelectedPassage}
				story={story}
			/>
			<DeletePassagesButton passages={selectedPassages} story={story} />
			<TestPassageButton passage={soloSelectedPassage} story={story} />
			<StartAtPassageButton passage={soloSelectedPassage} story={story} />
			<GoToPassageButton onOpenFuzzyFinder={onOpenFuzzyFinder} />
			<SelectAllPassagesButton story={story} />
			<DeselectAllPassagesButton
				story={story}
				selectedPassages={selectedPassages}
			/>
			<IconButton
				label="Arrange Passages"
				icon={<span style={{fontWeight: 'bold'}}>↔️</span>}
				onClick={arrangePassages}
				tooltipPosition="bottom"
			/>
		</ButtonBar>
	);
};
