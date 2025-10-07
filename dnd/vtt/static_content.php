<?php

declare(strict_types=1);

if (!function_exists('flattenScenes')) {
    function flattenScenes(array $data): array
    {
        $scenes = [];

        foreach ($data['rootScenes'] ?? [] as $scene) {
            if (!is_array($scene)) {
                continue;
            }
            $scene['folderId'] = null;
            $scenes[] = $scene;
        }

        foreach ($data['folders'] ?? [] as $folder) {
            if (!is_array($folder) || !isset($folder['scenes']) || !is_array($folder['scenes'])) {
                continue;
            }

            $folderId = isset($folder['id']) ? (string) $folder['id'] : null;
            foreach ($folder['scenes'] as $scene) {
                if (!is_array($scene)) {
                    continue;
                }
                $scene['folderId'] = $folderId;
                $scenes[] = $scene;
            }
        }

        return $scenes;
    }
}

if (!function_exists('filterTokensForPlayers')) {
    function filterTokensForPlayers(array $tokens): array
    {
        return array_values(array_filter($tokens, static function ($token) {
            if (!is_array($token)) {
                return false;
            }

            $folder = isset($token['folderId']) ? (string) $token['folderId'] : '';
            return $folder === 'pcs';
        }));
    }
}

return [
    'defaultActiveSceneId' => 'scene-academy-plaza',
    'latestChangeId' => 1,
    'sceneData' => [
        'folders' => [
            [
                'id' => 'folder-campus',
                'name' => 'Strixhaven Campus',
                'scenes' => [
                    [
                        'id' => 'scene-academy-plaza',
                        'name' => 'Archway Plaza',
                        'description' => 'Students gather beneath the archway to trade stories before class begins.',
                        'accent' => '#1d4ed8',
                        'map' => [
                            'image' => '../images/item_1751143124266_tx8vaml8f_1751143140.png',
                            'gridScale' => 50,
                        ],
                    ],
                    [
                        'id' => 'scene-central-library',
                        'name' => 'Biblioplex Stacks',
                        'description' => 'Towering shelves of spellbooks stretch into the vaulted ceiling with pools of soft light.',
                        'accent' => '#7c3aed',
                        'map' => [
                            'image' => '../images/item_1751144324967_4fp3yc11h_1751144376.png',
                            'gridScale' => 40,
                        ],
                    ],
                ],
            ],
        ],
        'rootScenes' => [
            [
                'id' => 'scene-crimson-woods',
                'name' => 'Crimson Woods',
                'description' => 'A dusky forest clearing where the trees glow with bioluminescent lichen.',
                'accent' => '#b91c1c',
                'map' => [
                    'image' => '../images/item_1751334037204_ywlr0k6pn_1752089376.png',
                    'gridScale' => 60,
                ],
            ],
        ],
    ],
    'tokenLibrary' => [
        [
            'id' => 'token-heroic-wizard',
            'name' => 'Heroic Wizard',
            'folderId' => 'pcs',
            'schoolId' => 'prismari',
            'size' => [
                'width' => 1,
                'height' => 1,
            ],
            'stamina' => 12,
            'imageData' => 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij4KICAgIDxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjMWQ0ZWQ4IiByeD0iMTYiIHJ5PSIxNiIgLz4KICAgIDx0ZXh0IHg9IjY0IiB5PSI3NCIgZm9udC1zaXplPSI1NiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SDwvdGV4dD4KPC9zdmc+',
            'createdAt' => 1717286400,
            'updatedAt' => 1717286400,
        ],
        [
            'id' => 'token-ember-elf',
            'name' => 'Ember Elf',
            'folderId' => 'monsters',
            'schoolId' => 'witherbloom',
            'size' => [
                'width' => 1,
                'height' => 1,
            ],
            'stamina' => 8,
            'imageData' => 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij4KICAgIDxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjYjkxYzFjIiByeD0iMTYiIHJ5PSIxNiIgLz4KICAgIDx0ZXh0IHg9IjY0IiB5PSI3NCIgZm9udC1zaXplPSI1NiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RTwvdGV4dD4KPC9zdmc+',
            'createdAt' => 1717286400,
            'updatedAt' => 1717286400,
        ],
    ],
    'sceneTokens' => [
        'scene-academy-plaza' => [
            [
                'id' => 'scene-token-heroic-wizard',
                'libraryId' => 'token-heroic-wizard',
                'name' => 'Heroic Wizard',
                'imageData' => 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij4KICAgIDxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSIjMWQ0ZWQ4IiByeD0iMTYiIHJ5PSIxNiIgLz4KICAgIDx0ZXh0IHg9IjY0IiB5PSI3NCIgZm9udC1zaXplPSI1NiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SDwvdGV4dD4KPC9zdmc+',
                'stamina' => 12,
                'size' => [
                    'width' => 1,
                    'height' => 1,
                ],
                'position' => [
                    'x' => 12.5,
                    'y' => 18.75,
                ],
            ],
        ],
    ],
];
