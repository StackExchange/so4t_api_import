# Stack Overflow for Teams API Import (so4t_api_import)
An API script for Stack Overflow for Teams that facilitates bulk-importing questions, answers, or articles from a CSV file.

## Requirements
* A Stack Overflow for Teams instance (Business or Enterprise)
* Python 3.x ([download](https://www.python.org/downloads/))
* Operating system: Linux, MacOS, or Windows

## Setup

[Download](https://github.com/StackExchange/so4t_api_import/archive/refs/heads/main.zip) and unpack the contents of this repository

**Install Required Python Libraries**

* Open a terminal window (or, for Windows, a command prompt)
* Navigate to the directory where you unpacked the files
* Install the dependencies: `pip3 install -r requirements.txt`

**API Authentication**

For the Business tier, you'll need a [personal access token](https://stackoverflowteams.help/en/articles/4385859-stack-overflow-for-teams-api) (PAT). You'll need to obtain an API key and an access token for Enterprise. Documentation for creating an Enterprise key and token can be found within your instance at this url: `https://[your_site]/api/docs/authentication`

**Before proceeding, please note a critical step when creating your API Application in Stack Overflow Enterprise for Access Token generation:**

**Generating an Access Token**

To generate an Access Token for Enterprise, you must first ensure your API Application is correctly configured:

* **API Application "Domain" Field Requirement:** When creating your API Application (where you obtain your Client ID and Client Secret), the "Domain" field *must* be populated with the base URL of your Stack Overflow Enterprise instance (e.g., `https://your.so-enterprise.url`). **Although the UI may mark this field as 'Optional,' failure to populate it will prevent Access Token generation and lead to a `"redirect_uri is not configured"` error during the OAuth flow.**

Once your API Application is configured with a valid Domain, follow these steps to generate your Access Token:

* Go to the page where you created your API key. Take note of the "Client ID" associated with your API key.
* Go to the following URL, replacing the base URL, the `client_id`, and the base URL of the `redirect_uri` with your own:
`https://YOUR.SO-ENTERPRISE.URL/oauth/dialog?client_id=111&redirect_uri=https://YOUR.SO-ENTERPRISE.URL/oauth/login_success`
* You may be prompted to log in to Stack Overflow Enterprise if you're not already. Either way, you'll be redirected to a page that simply says "Authorizing Application"
* In the URL of that page, you'll find your access token. Example: `https://YOUR.SO-ENTERPRISE.URL/oauth/login_success#access_token=YOUR_TOKEN`

**Note on Access Token Requirements:**
While API v3 now generally allows querying with just an API key for most GET requests, certain paths and data (e.g., `/images` and the email attribute on a `User` object) still specifically require an Access Token for access. If you encounter permissions errors on such paths, ensure you are using an Access Token.

## Basic Usage
First, you'll need to populate a CSV with content to import into Stack Overflow for Teams. There's a [CSV Templates](https://github.com/StackExchange/so4t_api_import/tree/main/CSV%20Templates) directory in this project that you can use as a starting point. The CSV files found therein are preformatted with the proper column names.

Once a CSV file is created, open a terminal window and navigate to the directory where you unpacked the script. Examples of running the script:
* Importing questions into Business from a CSV file named 'questions.csv': 
`python3 so4t_api_import.py --url "https://stackoverflowteams.com/c/TEAM-NAME" --token "YOUR_TOKEN" --csv 'questions.csv' --questions`
* Importing articles into Enterprise from a CSV file named 'articles.csv': `python3 so4t_api_import.py --url "https://SUBDOMAIN.stackenterprise.co" --key "YOUR_KEY --token "YOUR_TOKEN" --csv 'articles.csv' --articles`

Standard usage of the script will involve using the following arguments:
* `--url https://your.instance.url`
* `--token 'YOUR_TOKEN'`
* `--key 'YOUR_KEY'` [only required for Enterprise]
* `--csv 'path/to/file.csv'`
* `--articles` or `--questions` [one or the other, depending on what you're importing]

You can also view available arguments and descriptions via the `--help` argument. Example: `python3 so4t_api_import.py --help`

As the script runs, it will update the terminal window with the tasks it performs.

## Advanced Usage: User Impersonation (Legacy Feature)
**Important Note:** The user impersonation functionality is a legacy feature primarily intended for specific, complex content migration scenarios. Its use is generally **discouraged** for ongoing operations due to its advanced nature and potential complexities.

If you believe you require user impersonation for your specific import needs:

* This functionality is not enabled by default and **requires opening a ticket with enterprise-support@stackoverflow.com to discuss your specific use case and enable it.**
* It also requires a [service key](https://stackoverflowteams.help/en/articles/8043418-stack-overflow-for-teams-api-v3#manage-api-v3-applications-and-service-keys) (owner set to Community user) with admin privileges to configure and use this API script's impersonation functionality.
* Adding the `--impersonate` argument to the basic usage of the script allows you to leverage this functionality. You'll need to use an impersonation CSV format, which includes additional columns for the account IDs of the users to impersonate. Please see the [CSV Templates](https://github.com/StackExchange/so4t_api_import/tree/main/CSV%20Templates) directory and use a template with the 'impersonation' prefix.

## Known limitations and considerations

* Articles can only be imported at a rate of one per minute. Yes, it's slow. This limitation is in API v2.3. API v3 does not have this limitation, and it's the version of the API the script uses for importing questions and answers, which is much faster. However, API v3 is still a work in progress and does not yet support Articles.
* Source content that contains images, embeds, and attachments cannot be imported via API. Images can be imported by copy-paste after the bulk import is completed. Embeds and attachments can likewise be added post-import by either copying their contents or hyperlinking to the external file. 
* Question imports are currently designed to support importing a corresponding answer. This is on the backlog for improvement.

If you encounter problems using the script, please leave feedback in the Github Issues. You can also clone and change the script to suit your needs. It is provided as-is, with no warranty or guarantee of any kind.
