import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import { checkCopilotAvailable, generatePRDescription } from '../utils/copilot.js';
import { checkGhAuth, checkGhInstalled, createPR, createPRFill } from '../utils/gh.js';
import { getCurrentBranch, getLog, getLogDiff, isGitRepo, pushSetUpstream } from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { getRepoInfoFromRemote } from '../utils/remote.js';
import { getBaseBranch, getProtectedBranches } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'submit',
    description: 'Push current branch and create a pull request',
  },
  args: {
    draft: {
      type: 'boolean',
      description: 'Create PR as draft',
      default: false,
    },
    'no-ai': {
      type: 'boolean',
      description: 'Skip AI PR description generation',
      default: false,
    },
    model: {
      type: 'string',
      description: 'AI model to use for PR description generation',
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const config = readConfig();
    if (!config) {
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    const { origin } = config;
    const baseBranch = getBaseBranch(config);
    const protectedBranches = getProtectedBranches(config);
    const currentBranch = await getCurrentBranch();

    if (!currentBranch) {
      error('Could not determine current branch.');
      process.exit(1);
    }

    // 1. Verify not on a protected branch
    if (protectedBranches.includes(currentBranch)) {
      error(
        `Cannot submit ${protectedBranches.map((b) => pc.bold(b)).join(' or ')} as a PR. Switch to your feature branch.`,
      );
      process.exit(1);
    }

    heading('🚀 contrib submit');

    // 2. Push branch
    info(`Pushing ${pc.bold(currentBranch)} to ${origin}...`);
    const pushResult = await pushSetUpstream(origin, currentBranch);
    if (pushResult.exitCode !== 0) {
      error(`Failed to push: ${pushResult.stderr}`);
      process.exit(1);
    }

    // 3. Check if gh CLI is available
    const ghInstalled = await checkGhInstalled();
    const ghAuthed = ghInstalled && (await checkGhAuth());

    if (!ghInstalled || !ghAuthed) {
      // 5. gh unavailable: print manual PR URL
      const repoInfo = await getRepoInfoFromRemote(origin);
      if (repoInfo) {
        const prUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/compare/${baseBranch}...${currentBranch}?expand=1`;
        console.log();
        info('Create your PR manually:');
        console.log(`  ${pc.cyan(prUrl)}`);
      } else {
        info('gh CLI not available. Create your PR manually on GitHub.');
      }
      return;
    }

    // 4. Generate AI PR description
    let prTitle: string | null = null;
    let prBody: string | null = null;

    if (!args['no-ai']) {
      const copilotError = await checkCopilotAvailable();
      if (!copilotError) {
        info('Generating AI PR description...');
        const commits = await getLog(baseBranch, 'HEAD');
        const diff = await getLogDiff(baseBranch, 'HEAD');
        const result = await generatePRDescription(commits, diff, args.model);
        if (result) {
          prTitle = result.title;
          prBody = result.body;
          console.log(`\n  ${pc.dim('AI title:')} ${pc.bold(pc.cyan(prTitle))}`);
          console.log(`\n${pc.dim('AI body preview:')}`);
          console.log(pc.dim(prBody.slice(0, 300) + (prBody.length > 300 ? '...' : '')));
        } else {
          warn('AI did not return a PR description.');
        }
      } else {
        warn(`AI unavailable: ${copilotError}`);
      }
    }

    // Let user confirm/edit or choose to fill manually
    if (prTitle && prBody) {
      const action = await selectPrompt('What would you like to do with the PR description?', [
        'Use AI description',
        'Edit title',
        'Write manually',
        'Use gh --fill (auto-fill from commits)',
      ]);

      if (action === 'Use AI description') {
        // use as-is
      } else if (action === 'Edit title') {
        prTitle = await inputPrompt('PR title', prTitle);
      } else if (action === 'Write manually') {
        prTitle = await inputPrompt('PR title');
        prBody = await inputPrompt('PR body (markdown)');
      } else {
        // gh --fill
        const fillResult = await createPRFill(baseBranch, args.draft);
        if (fillResult.exitCode !== 0) {
          error(`Failed to create PR: ${fillResult.stderr}`);
          process.exit(1);
        }
        success(`✅ PR created: ${fillResult.stdout.trim()}`);
        return;
      }
    } else {
      const useManual = await confirmPrompt('Create PR with manual title/body?');
      if (useManual) {
        prTitle = await inputPrompt('PR title');
        prBody = await inputPrompt('PR body (markdown)');
      } else {
        const fillResult = await createPRFill(baseBranch, args.draft);
        if (fillResult.exitCode !== 0) {
          error(`Failed to create PR: ${fillResult.stderr}`);
          process.exit(1);
        }
        success(`✅ PR created: ${fillResult.stdout.trim()}`);
        return;
      }
    }

    if (!prTitle) {
      error('No PR title provided.');
      process.exit(1);
    }

    const prResult = await createPR({
      base: baseBranch,
      title: prTitle,
      body: prBody ?? '',
      draft: args.draft,
    });

    if (prResult.exitCode !== 0) {
      error(`Failed to create PR: ${prResult.stderr}`);
      process.exit(1);
    }

    success(`✅ PR created: ${prResult.stdout.trim()}`);
  },
});
