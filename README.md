# Hopkins
A small tool for generating static sites for displaying poetry I want to keep centralized somewhere.

## Netlify codeword gate

The site uses a Netlify Edge Function to require a simple codeword before serving pages.

In Netlify, set this environment variable for the site:

- `HOPKINS_CODEWORD`: the codeword visitors should enter

Then redeploy. If the variable is missing, the gate fails closed and shows a configuration message instead of serving the site.
