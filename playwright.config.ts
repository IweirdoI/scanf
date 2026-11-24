import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./test/ui', workers:1, reporter:'list', use:{ channel:process.env.CI ? undefined : 'msedge', viewport:{width:1440,height:960}, headless:true } });
