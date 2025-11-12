'''
This Python script is a working proof of concept example of using Stack Internal APIs for Content Import. 
If you run into difficulties, please leave feedback in the Github Issues.
'''

# Standard Python libraries
import argparse
import csv
import json
import time

# Third-party libraries
import requests


def main():

    args = get_args()
    import_data = read_csv(args.csv)

    if args.questions and args.articles:
        print('Please specify either --questions or --articles in your command, not both.')
        raise SystemExit
    if not args.questions and not args.articles:
        print('Please specify --questions or --articles in your command.')
        raise SystemExit

    results = data_integrity_check(import_data, args)
    if results:
        # Future: export results to CSV
        print("Data integrity check failed. Please fix the following issues:")
        for result in results:
            print(f'"{result["title"]}": {result["message"]}')
        raise SystemExit

    if args.questions:
        import_questions(import_data, args)
    elif args.articles:
        import_articles(import_data, args)


### need to refactor args and update help
def get_args():

    parser = argparse.ArgumentParser(
        prog='so4t_api_import.py',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description='Uses the Stack Internal API to import \
        data from a file.',
        # epilog = 'Example for Stack Internal (Business): \n'
        #         'python3 so4t_api_import.py --url "https://stackoverflowteams.com/c/TEAM-NAME" '
        #         '--token "YOUR_TOKEN" \n\n'
        #         'Example for Stack Internal (Enterprise): \n'
        #         'python3 so4t_api_import.py --url "https://SUBDOMAIN.stackenterprise.co" '
        #         '--key "YOUR_KEY" --token "YOUR_TOKEN" --\n\n')
    )
    parser.add_argument('--url', 
                        type=str,
                        help='Base URL for your Stack Internal instance.')
    parser.add_argument('--token',
                        type=str,
                        help='API token for your Stack Internal instance.')
    parser.add_argument('--key',
                        type=str,
                        help='API key for your Enterprise instance.')
    parser.add_argument('--csv',
                        type=str,
                        help='Path to CSV file to import.')
    parser.add_argument('--questions',
                        action='store_true',
                        help='Import questions (and answers).')
    parser.add_argument('--articles',
                        action='store_true',
                        help='Import articles.')
    parser.add_argument('--impersonate',
                        action='store_true',
                        help='Impersonate users. Requires Enterprise, admin privileges, '
                        'and impersonation to be enabled')

    return parser.parse_args()


def data_integrity_check(data, args):

    # Stack Overflow uses the CommonMark parser for Markdown: https://commonmark.org/help/
    # https://meta.stackexchange.com/questions/348746/were-switching-to-commonmark

    # The following HTML tags are supported: <p>, <strong>, <b>, <em>, <i>, <ul>, <ol>, <li>, <br>
    # unsupported_html_tags = ['<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>', '<hr>', '<blockquote>',
    #                             '<strike>', '<s>', '<del>', '<sub>', '<sup>', '<code>', '<pre>',
    #                             '<img>', '<a>', '<span>', '<div>', '<iframe>', '<object>', '<embed>',
    #                             '<abbr>', '<acronym>', '<address>', '<bdo>', '<big>', '<button>',
    #                             '<caption>', '<center>', '<cite>', '<col>', '<colgroup>', '<dd>',
    #                             '<dfn>', '<dl>', '<dt>', '<fieldset>', '<font>', '<form>', '<hgroup>',
    #                             '<ins>', '<kbd>', '<label>', '<legend>', '<map>', '<menu>', '<noscript>',
    #                             '<optgroup>', '<option>', '<param>', '<q>', '<samp>', '<select>',
    #                             '<small>', '<strong>', '<style>', '<textarea>', '<tt>', '<var>',
    #                             '<u>', '<xmp>', '<applet>', '<base>', '<basefont>', '<bgsound>',
    #                             '<blink>', '<body>', '<embed>', '<frame>', '<frameset>', '<head>',
    #                             '<html>', '<ilayer>', '<layer>', '<link>', '<meta>', '<noframes>']

    article_types = ['knowledge-article', 'how-to-guide', 'announcement', 'policy']
    invalid_tag_chars = ['<', '>', '&', '"', "'", '`', '(', ')', '[', ']', '{', '}', '\\', '/', '_', 
                        '=', '~', '|', '^', '@', '$', '%', '*', '?', '!']

    results = []
    for row in data:

        # check character limit of title
        if len(row['title']) > 150:
            result = {
                'title': row['title'],
                'message': 'Title too long. Must be 150 characters or fewer.'
            }
            results.append(result)

        # check charaxter limits for content
        if args.articles and len(row['body']) > 100000:
            result = {
                'title': row['title'],
                'message': 'Body too long. Must be 100,000 characters or fewer.'
            }
            results.append(result)
        elif args.questions and len(row['body']) > 30000:
            result = {
                'title': row['title'],
                'message': 'Body too long. Must be 30,000 characters or fewer.'
            }
            results.append(result)
        elif args.questions and len(row['answer']) > 30000:
            result = {
                'title': row['title'],
                'message': 'Answer too long. Must be 30,000 characters or fewer.'
            }
            results.append(result)

        if args.articles and row['type'] not in article_types:
            result = {
                'title': row['title'],
                'message': 'Invalid article type. Must be one of the following: '
                'knowledge-article, how-to-guide, announcement, policy'
            }
            results.append(result)

        tags = row['tags'].split()
        for tag in tags:
            if len(tag) > 35:
                result = {
                    'title': row['title'],
                    'message': f'Tag name "{tag}" too long. Must be 35 characters or fewer.'
                }
                results.append(result)

            for char in invalid_tag_chars:
                if char in tag:
                    result = {
                        'title': row['title'],
                        'message': f'Tag name "{tag}" contains invalid character "{char}".'
                    }
                    results.append(result)

        if args.articles and len(tags) > 4:
            result = {
                'title': row['title'],
                'message': 'Too many tags. Must be 4 or fewer.'
            }
            results.append(result)
        elif args.questions and len(tags) > 5:
            result = {
                'title': row['title'],
                'message': 'Too many tags. Must be 5 or fewer.'
            }
            results.append(result)

    return results


def import_articles(data, args):

    client = V2Client(args)
    for row in data:
        if args.impersonate and client.soe:
            client.impersonation_token = client.get_impersonation_token(row['author_account_id'])
            print(f'Impersonating user {row["author_account_id"]} for article "{row["title"]}"')
        client.create_article(row['title'], row['body'], row['type'], row['tags'])


def import_questions(data, args):

    client = V3Client(args)
    if args.impersonate and client.soe:
        token_exchange = V2Client(args)
        impersonation = True
    else:
        impersonation = False

    for row in data:
        if impersonation:
            client.impersonation_token = token_exchange.get_impersonation_token(
                row['asker_account_id'])
            print(f'Impersonating user {row["asker_account_id"]} for question "{row["title"]}"')
        # tags need to be split() into a list for API v3
        new_question = client.create_question(row['title'], row['body'], row['tags'].split())

        if impersonation:
            client.impersonation_token = token_exchange.get_impersonation_token(
                row['answerer_account_id'])
            print(f'Impersonating user {row["answerer_account_id"]} for answer to question')
        client.create_answer(new_question['id'], row['answer'])


class V2Client(object):

    def __init__(self, args):

        if "stackoverflowteams.com" in args.url:
            self.soe = False # Stack Internal Business or Basic
            self.api_url = "https://api.stackoverflowteams.com/2.3"
            self.team_slug = args.url.split("https://stackoverflowteams.com/c/")[1]
            self.api_key = None
            self.token = args.token
            self.impersonation_token = None
            # Add User-Agent header
            self.headers = {
                'X-API-Access-Token': self.token,
                'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
            }
        else:
            self.soe = True # Stack Internal (Enterprise)
            self.api_url = args.url + "/api/2.3"
            self.team_slug = None
            self.api_key = args.key
            self.token = args.token
            self.impersonation_token = None
            # Add User-Agent header
            self.headers = {
                'X-API-Key': self.api_key,
                'X-API-Access-Token': self.token,
                'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
            }

        self.ssl_verify = self.test_connection()


    def test_connection(self):

        url = self.api_url + "/tags"
        ssl_verify = True
        
        params = {}
        if self.soe: # Stack Internal (Enterprise)
            # Add User-Agent header
            headers = {
                'X-API-Key': self.api_key,
                'X-API-Access-Token': self.token,
                'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
            }
        else: # Stack Internal Business or Basic
            # Add User-Agent header
            headers = {
                'X-API-Access-Token': self.token,
                'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
            }
            params['team'] = self.team_slug

        print("Testing API 2.3 connection...")
        try:
            response = requests.get(url, params=params, headers=headers)
        except requests.exceptions.SSLError:
            print("SSL error. Trying again without SSL verification...")
            response = requests.get(url, params=params, headers=headers, verify=False)
            ssl_verify = False
        
        if response.status_code == 200:
            print("API connection successful")
            return ssl_verify
        else:
            print("Unable to connect to API. Please check your URL and API key.")
            print(response.text)
            raise SystemExit


    def get_impersonation_token(self, account_id):

        endpoint = '/access-tokens/exchange'
        method = 'post'

        params = {
            'access_tokens': self.token,
            'exchange_type': 'impersonate',
            'account_id': account_id
        }

        response_data = self.send_api_call(endpoint, method, params)
        impersonation_token = response_data[0]['access_token']

        return impersonation_token


    def create_article(self, title, body, type, tags):
        '''
        Article type must be one of four options: knowledge-article, how-to-guide, announcement, 
        or policy
        '''
        endpoint = "/articles/add"
        method = 'post'

        params = {
                'title': title,
                'body': body,
                'article_type': type,
                'tags': tags
        }

        self.send_api_call(endpoint, method, params)
        print(f"Created article: {title}")
    

    def send_api_call(self, endpoint, method, params, filter_id=None):

        get_response = getattr(requests, method, None)
        endpoint_url = self.api_url + endpoint

        if self.soe: # Stack Internal (Enterprise)
            if self.impersonation_token: # If an impersonation token is provided, use it
                token = self.impersonation_token
            else:
                token = self.token
            headers = {
                'X-API-Key': self.api_key,
                'X-API-Access-Token': token
            }
        else: # Stack Internal Business or Basic
            headers = {'X-API-Access-Token': self.token}
            params['team'] = self.team_slug

        if filter_id: # If a filter is provided, add it to the params
            params['filter'] = filter_id

        data = []
        while True: # Keep performing API calls until all items are received
            if self.impersonation_token: # requires data= instead of params=
                response = get_response(endpoint_url, headers=headers, data=params,
                                        verify=self.ssl_verify)
            else:
                response = get_response(endpoint_url, headers=headers, params=params, 
                                        verify=self.ssl_verify)

            if response.status_code == 400 and response.json().get('backoff'):
                self.handle_backoff(response.json())
                continue
            elif response.status_code != 200:
                print(f"/{endpoint_url} API call failed with status code: {response.status_code}.")
                print(response.text)
                break
            
            response_json = response.json()
            data += response_json.get('items')

            # if the response doesn't have a 'has_more' key, break the loop
            if not response_json.get('has_more'):
                break

            # If the endpoint gets overloaded, it will send a backoff request in the response
            # Failure to backoff will result in a 502 Error ("throttle violation")
            if response_json.get('backoff'):
                self.handle_backoff(response_json)
                continue

            # If the loop hasn't been broken, pagination is in use. Increment the page number.
            params['page'] += 1
        
        return data


    def handle_backoff(self, response_json):
            
        backoff_time = response_json.get('backoff') + 1
        print(f"API Backoff request received. Waiting {backoff_time} seconds...")
        time.sleep(backoff_time)


class V3Client(object):


    def __init__(self, args):

        self.token = args.token
        self.impersonation_token = None
        if "stackoverflowteams.com" in args.url:
            self.soe = False
            self.team_slug = args.url.split("https://stackoverflowteams.com/c/")[1]
            self.api_url = f"https://api.stackoverflowteams.com/v3/teams/{self.team_slug}"
        else:
            self.soe = True
            self.api_url = args.url + "/api/v3"

        # Add User-Agent header
        self.headers = {
            'Authorization': f'Bearer {self.token}',
            'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
        }
        self.ssl_verify = self.test_connection()

    
    def test_connection(self):

        endpoint = "/tags"
        endpoint_url = self.api_url + endpoint
        # Add User-Agent header
        headers = {
            'Authorization': f'Bearer {self.token}',
            'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
        }
        ssl_verify = True

        print("Testing API v3 connection...")
        try:
            response = requests.get(endpoint_url, headers=headers)
        except requests.exceptions.SSLError:
            print("SSL error. Trying again without SSL verification...")
            response = requests.get(endpoint_url, headers=headers, verify=False)
            ssl_verify = False
        
        if response.status_code == 200:
            print("API connection successful")
            return ssl_verify
        else:
            print("Unable to connect to API. Please check your URL and API key.")
            print(response.text)
            raise SystemExit


    def create_question(self, title, body, tags):

        method = 'post'
        endpoint = "/questions"
        params = {
            "title": title,
            "body": body,
            "tags": tags
        }
        
        new_question = self.send_api_call(method, endpoint, params)
        print(f"Created question: {title}")

        return new_question


    def create_answer(self, question_id, body):
   
        method = 'post'
        endpoint = f"/questions/{question_id}/answers"
        params = {
            "body": body,
        }

        new_answer = self.send_api_call(method, endpoint, params)
        print(f"Created answer for question {question_id}")

        return new_answer


    def send_api_call(self, method, endpoint, params={}):

        get_response = getattr(requests, method, None)
        endpoint_url = self.api_url + endpoint

        if self.impersonation_token: # If an impersonation token is provided, use it
            # Add User-Agent header
            headers = {
                'Authorization': f'Bearer {self.impersonation_token}',
                'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
            }
        else:
            # Add User-Agent header
            headers = {
                'Authorization': f'Bearer {self.token}',
                'User-Agent': 'so4t_api_import/1.0 (http://your-app-url.com; your-contact@email.com)'
            }

        data = []
        while True:
            if method == 'get':
                response = get_response(endpoint_url, headers=headers, params=params, 
                                        verify=self.ssl_verify)
            else:
                response = get_response(endpoint_url, headers=headers, json=params, 
                                        verify=self.ssl_verify)

            # check for rate limiting thresholds
            # print(response.headers) 
            if response.status_code not in [200, 201, 204]:
                print(f"API call to {endpoint_url} failed with status code {response.status_code}")
                print(response.text)
                raise SystemExit
                        
            try:
                json_data = response.json()
            except json.decoder.JSONDecodeError: # some API calls do not return JSON data
                print(f"API request successfully sent to {endpoint_url}")
                return

            if type(params) == dict and params.get('page'): # check request for pagination
                print(f"Received page {params['page']} from {endpoint_url}")
                data += json_data['items']
                if params['page'] == json_data['totalPages']:
                    break
                params['page'] += 1
            else:
                print(f"API request successfully sent to {endpoint_url}")
                data = json_data
                break

        return data


def read_csv(file_path):

    with open(file_path, 'r') as f:
        data = csv.DictReader(f)
        data = [row for row in data]
    return data


if __name__ == '__main__':

    main()