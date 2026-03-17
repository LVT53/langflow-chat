<script lang="ts">
  import { goto } from '$app/navigation';

  let email = '';
  let password = '';
  let error = null;
  let loading = false;

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      error = 'Please fill in all fields.';
      return;
    }

    error = '';
    loading = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        // Success, redirect to the protected area
        await goto('/');
      } else {
        const data = await response.json().catch(() => ({}));
        error = data.error || 'Login failed. Please check your credentials.';
      }
    } catch (err) {
      error = 'An unexpected error occurred. Please try again later.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In</title>
</svelte:head>

<div class="min-h-screen w-full flex items-center justify-center bg-surface-page p-lg md:p-2xl">
  <div class="w-[90vw] sm:w-[448px] max-w-[448px] mx-auto p-xl md:p-2xl bg-surface-elevated rounded-lg shadow-lg border border-border">
    <div class="text-center mb-10">
      <h1 class="text-4xl md:text-5xl font-serif font-bold text-text-primary mb-3">Sign In</h1>
      <p class="text-lg text-text-muted font-serif">Welcome back. Please enter your details.</p>
    </div>

    <form on:submit|preventDefault={handleSubmit} class="flex flex-col gap-y-6">
      <div class="space-y-2">
        <label for="email" class="block text-sm font-medium text-text-primary font-serif">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          bind:value={email}
          disabled={loading}
          on:input={() => error = ''}
          class="w-full min-h-[48px] px-md py-sm font-serif text-base md:text-lg border border-border bg-surface-page text-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-focus-ring disabled:opacity-50 transition-shadow placeholder-text-muted"
          placeholder="you@example.com"
        />
      </div>

      <div class="space-y-2">
        <label for="password" class="block text-sm font-medium text-text-primary font-serif">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          disabled={loading}
          on:input={() => error = ''}
          class="w-full min-h-[48px] px-md py-sm font-serif text-base md:text-lg border border-border bg-surface-page text-text-primary rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-focus-ring disabled:opacity-50 transition-shadow placeholder-text-muted"
          placeholder="••••••••"
        />
      </div>

      {#if error}
        <div class="p-md bg-surface-page text-danger text-sm md:text-base rounded-md border border-danger font-serif" role="alert" data-testid="login-error">
          {error}
        </div>
      {/if}

       <button
         type="submit"
         disabled={loading}
         class="w-full min-h-[56px] flex justify-center items-center py-sm px-md border border-transparent rounded-md shadow-sm text-lg font-serif font-bold text-surface-page bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focus-ring disabled:opacity-70 disabled:cursor-not-allowed transition-all mt-6 cursor-pointer"
       >
        {#if loading}
          <svg class="animate-spin -ml-1 mr-3 h-6 w-6 text-surface-page" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Signing in...
        {:else}
          Sign In
        {/if}
      </button>
    </form>
  </div>
</div>
