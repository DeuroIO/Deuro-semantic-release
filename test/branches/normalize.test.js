import test from 'ava';
import normalize from '../../lib/branches/normalize';

const toTags = versions => versions.map(version => ({version}));

test('LTS branches - initial state', t => {
  const lts = [{name: '1.x', tags: []}, {name: '1.1.x', tags: []}, {name: '1.2.x', tags: []}];
  const release = [{name: 'master', tags: []}];
  t.deepEqual(
    normalize.lts({lts, release}).map(({type, name, range, channel, 'merge-range': ltsRange}) => ({
      type,
      name,
      range,
      channel,
      'merge-range': ltsRange,
    })),
    [
      {type: 'lts', name: '1.1.x', range: '>=1.1.0 <1.0.0', channel: '1.1.x', 'merge-range': '1.1.x'},
      {type: 'lts', name: '1.2.x', range: '>=1.2.0 <1.0.0', channel: '1.2.x', 'merge-range': '1.2.x'},
      {type: 'lts', name: '1.x', range: '>=1.3.0 <1.0.0', channel: '1.x', 'merge-range': '1.x'},
    ]
  );
});

test('LTS branches - cap range to first release present on default branch and not in any LTS one', t => {
  const lts = [
    {name: '1.x', tags: toTags(['1.0.0', '1.1.0', '1.1.1', '1.2.0', '1.2.1', '1.3.0', '1.4.0', '1.5.0'])},
    {name: 'name', range: '1.1.x', tags: toTags(['1.0.0', '1.0.1', '1.1.0', '1.1.1'])},
    {name: '1.2.x', tags: toTags(['1.0.0', '1.1.0', '1.1.1', '1.2.0', '1.2.1'])},
    {name: '2.x.x', tags: toTags(['1.0.0', '1.1.0', '1.1.1', '1.2.0', '1.2.1', '1.5.0'])},
  ];
  const release = [
    {
      name: 'master',
      tags: toTags(['1.0.0', '1.1.0', '1.1.1', '1.2.0', '1.2.1', '1.3.0', '1.4.0', '1.5.0', '1.6.0', '2.0.0']),
    },
  ];

  t.deepEqual(
    normalize.lts({lts, release}).map(({type, name, range, channel, 'merge-range': ltsRange}) => ({
      type,
      name,
      range,
      channel,
      'merge-range': ltsRange,
    })),
    [
      {type: 'lts', name: 'name', range: '>=1.1.1 <1.2.0', channel: 'name', 'merge-range': '1.1.x'},
      {type: 'lts', name: '1.2.x', range: '>=1.2.1 <1.3.0', channel: '1.2.x', 'merge-range': '1.2.x'},
      {type: 'lts', name: '1.x', range: '>=1.5.0 <1.6.0', channel: '1.x', 'merge-range': '1.x'},
      {type: 'lts', name: '2.x.x', range: '>=2.0.0 <1.6.0', channel: '2.x.x', 'merge-range': '2.x.x'},
    ]
  );
});

test('LTS branches - cap range to default branch last release if all release are also present on LTS branch', t => {
  const lts = [
    {name: '1.x', tags: toTags(['1.0.0', '1.2.0', '1.3.0'])},
    {name: '2.x.x', tags: toTags(['1.0.0', '1.2.0', '1.3.0', '2.0.0'])},
  ];
  const release = [{name: 'master', tags: toTags(['1.0.0', '1.2.0', '1.3.0', '2.0.0'])}];

  t.deepEqual(
    normalize.lts({lts, release}).map(({type, name, range, channel, 'merge-range': ltsRange}) => ({
      type,
      name,
      range,
      channel,
      'merge-range': ltsRange,
    })),
    [
      {type: 'lts', name: '1.x', range: '>=1.3.0 <2.0.0', channel: '1.x', 'merge-range': '1.x'},
      {type: 'lts', name: '2.x.x', range: '>=2.0.0 <2.0.0', channel: '2.x.x', 'merge-range': '2.x.x'},
    ]
  );
});

test('Release branches - initial state', t => {
  const release = [{name: 'master', tags: []}, {name: 'next', tags: []}, {name: 'next-major', tags: []}];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=1.0.0 <1.1.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=1.1.0 <2.0.0', channel: 'next'},
    {type: 'release', name: 'next-major', range: '>=2.0.0', channel: 'next-major'},
  ]);
});

test('Release branches - 3 release branches', t => {
  const release = [
    {name: 'master', tags: toTags(['1.0.0', '1.0.1', '1.0.2'])},
    {name: 'next', tags: toTags(['1.0.0', '1.0.1', '1.0.2', '1.1.0', '1.2.0'])},
    {name: 'next-major', tags: toTags(['1.0.0', '1.0.1', '1.0.2', '1.1.0', '1.2.0', '2.0.0', '2.0.1', '2.1.0'])},
  ];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=1.0.2 <1.1.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=1.2.0 <2.0.0', channel: 'next'},
    {type: 'release', name: 'next-major', range: '>=2.1.0', channel: 'next-major'},
  ]);
});

test('Release branches - 2 release branches', t => {
  const release = [
    {name: 'master', tags: toTags(['1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0'])},
    {name: 'next', tags: toTags(['1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0', '2.0.0', '2.0.1', '2.1.0'])},
  ];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=1.2.0 <2.0.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=2.1.0', channel: 'next'},
  ]);
});

test('Release branches - 1 release branches', t => {
  const release = [{name: 'master', tags: toTags(['1.0.0', '1.1.0', '1.1.1', '1.2.0'])}];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=1.2.0', channel: undefined},
  ]);
});

test('Release branches - cap ranges to first release only present on following branch', t => {
  const release = [
    {name: 'master', tags: toTags(['1.0.0', '1.1.0', '1.2.0', '2.0.0'])},
    {name: 'next', tags: toTags(['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0'])},
    {name: 'next-major', tags: toTags(['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0', '2.2.0'])},
  ];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=2.0.0 <2.1.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=2.1.0 <2.2.0', channel: 'next'},
    {type: 'release', name: 'next-major', range: '>=2.2.0', channel: 'next-major'},
  ]);
});

test('Release branches - Handle missing previous tags in branch history', t => {
  const release = [
    {name: 'master', tags: toTags(['1.0.0', '2.0.0'])},
    {name: 'next', tags: toTags(['1.0.0', '1.1.0', '1.1.1', '1.2.0', '2.0.0'])},
  ];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=2.0.0 <3.0.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=3.0.0', channel: 'next'},
  ]);
});

test('Release branches - enforce release gaps after downstream merge', t => {
  const release = [
    {name: 'master', tags: toTags(['1.0.0', '1.1.0', '2.0.0'])},
    {name: 'next', tags: toTags(['1.0.0', '1.1.0', '2.0.0'])},
    {name: 'next-major', tags: toTags(['1.0.0', '1.1.0', '2.0.0'])},
  ];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=2.0.0 <2.1.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=2.1.0 <3.0.0', channel: 'next'},
    {type: 'release', name: 'next-major', range: '>=3.0.0', channel: 'next-major'},
  ]);
});

test('Release branches - limit releases on 2nd and 3rd branche based on 1st branch last release', t => {
  const release = [
    {name: 'master', tags: toTags(['1.0.0', '1.1.0', '2.0.0', '3.0.0'])},
    {name: 'next', tags: toTags(['1.0.0', '1.1.0'])},
    {name: 'next-major', tags: toTags(['1.0.0', '1.1.0', '2.0.0'])},
  ];

  t.deepEqual(normalize.release({release}).map(({type, name, range, channel}) => ({type, name, range, channel})), [
    {type: 'release', name: 'master', range: '>=3.0.0 <3.1.0', channel: undefined},
    {type: 'release', name: 'next', range: '>=3.1.0 <4.0.0', channel: 'next'},
    {type: 'release', name: 'next-major', range: '>=4.0.0', channel: 'next-major'},
  ]);
});

test('Prerelease branches - initial state', t => {
  const prerelease = [{name: 'beta', prerelease: true, tags: []}, {name: 'alpha', prerelease: 'preview', tags: []}];

  t.deepEqual(
    normalize.prerelease({prerelease}).map(({type, name, range, channel}) => ({type, name, range, channel})),
    [
      {type: 'prerelease', name: 'beta', range: '>=1.0.0-beta.1', channel: 'beta'},
      {type: 'prerelease', name: 'alpha', range: '>=1.0.0-preview.1', channel: 'alpha'},
    ]
  );
});

test('Prerelease branches - define ranges based on last release', t => {
  const prerelease = [
    {name: 'beta', prerelease: true, tags: toTags(['1.0.0', '1.1.0', '2.0.0-beta.1', '2.0.0-beta.2'])},
    {
      name: 'alpha',
      prerelease: 'preview',
      tags: toTags(['1.0.0', '1.1.0', '2.0.0-beta.1', '2.0.0-beta.2', '3.0.0-preview.1', '3.0.0-preview.2']),
    },
  ];

  t.deepEqual(
    normalize.prerelease({prerelease}).map(({type, name, range, channel}) => ({type, name, range, channel})),
    [
      {type: 'prerelease', name: 'beta', range: '>=2.0.0-beta.2', channel: 'beta'},
      {type: 'prerelease', name: 'alpha', range: '>=3.0.0-preview.2', channel: 'alpha'},
    ]
  );
});
