import axios from 'axios';
import * as types from './types';
import _ from 'lodash';
import config from 'Config';
import urlParams from 'Utils/urlParams';
import preparePairs from 'Utils/preparePairs';

export const errorAlert = payload => ({
  type: types.ERROR_ALERT,
  payload,
});

export const setWallet = payload => ({
  type: types.SET_WALLET,
  payload,
});

export const selectCoin = payload => dispatch => {
  dispatch({ type: types.COIN_SELECTED, payload });

  dispatch(
    setWallet({
      address: '',
      valid: false,
      show: false,
    })
  );
};

export const fetchCoinDetails = payload => dispatch => {
  const url = `${config.API_BASE_URL}/currency/`;
  const request = axios.get(url);
  const isWhiteLabel = config.REFERRAL_CODE && config.REFERRAL_CODE.length > 0;

  return request
    .then(response => {
      if (!response.data.length) return;

      const params = urlParams();
      let coins;

      if (params && params.hasOwnProperty('test')) {
        coins = _.filter(response.data, { has_enabled_pairs_for_test: true });
      } else if (isWhiteLabel) {
        coins = _.filter(response.data, {
          has_enabled_pairs: true,
          is_crypto: true,
        });
      } else {
        coins = _.filter(response.data, { has_enabled_pairs: true });
      }

      dispatch({ type: types.COINS_INFO, payload: coins });
    })
    .catch(error => {
      console.log(error);
    });
};

export const fetchPrice = payload => dispatch => {
  return new Promise(async (resolve, reject) => {
    const pair = payload.pair;

    const makeRequest = url => {
      return axios
        .get(url)
        .then(res => {
          return res.data;
        })
        .catch(err => {
          throw err;
        });
    };

    const setValidValues = amounts => {
      const data = { pair };

      data['deposit'] = amounts.amount_quote;
      data['receive'] = amounts.amount_base;
      data['lastEdited'] = payload.lastEdited;

      dispatch({ type: types.PRICE_FETCHED, payload: data });
      dispatch({
        type: types.ERROR_ALERT,
        payload: {
          show: false,
          type: types.INVALID_AMOUNT,
        },
      });

      resolve();
    };

    const setFaultyValues = err => {
      let data = { pair };

      if ('receive' in payload) {
        data['deposit'] = '...';
        data['receive'] = payload.receive;
        data['lastEdited'] = 'receive';
      } else if ('deposit' in payload) {
        data['deposit'] = payload.deposit;
        data['receive'] = '...';
        data['lastEdited'] = 'deposit';
      }

      dispatch({ type: types.PRICE_FETCHED, payload: data });

      if (err.response && err.response.data) {
        dispatch(
          errorAlert({
            message: err.response.data.detail,
            show: true,
            type: types.INVALID_AMOUNT,
          })
        );
      }

      reject();
    };

    try {
      let url = `${config.API_BASE_URL}/get_price/${pair}/?`;
      url += payload.deposit ? `amount_quote=${payload.deposit}` : `amount_base=${payload.receive}`;

      const amounts = await makeRequest(url);
      setValidValues(amounts);
    } catch (err) {
      if (payload.coinSelector) {
        let url = `${config.API_BASE_URL}/get_price/${pair}/`;
        const amounts = await makeRequest(url);
        setValidValues(amounts);
      } else {
        setFaultyValues(err);
      }
    }
  });
};

export const fetchPairs = () => {
  const url = `${config.API_BASE_URL}/pair/`;
  const request = axios.get(url);

  return (dispatch, getState) => {
    request
      .then(async response => {
        if (!response.data.length) return;

        const params = urlParams();
        const pairs = response.data.filter(pair => {
          if (params && params.hasOwnProperty('test')) {
            return !pair.disabled;
          } else {
            return !pair.disabled && !pair.test_mode;
          }
        });
        const processedPairs = preparePairs(pairs);

        dispatch({ type: types.PAIRS_FETCHED, payload: processedPairs });

        let depositCoin, receiveCoin;
        const coinsFromUrlParams = () => {
          return new Promise((resolve, reject) => {
            axios
              .get(`${config.API_BASE_URL}/pair/${params['pair']}`)
              .then(res => resolve(res.data))
              .catch(err => reject(err));
          });
        };

        const pickRandomPair = async () => {
          const pair = pairs[Math.floor(Math.random() * pairs.length)];
          depositCoin = pair.quote;
          receiveCoin = pair.base;
        };

        // Picks random deposit and receive coins.
        const pickCoins = async () => {
          // Checks if url has params. If yes then update accordingly and if no then pick random coins.
          if (params && params.hasOwnProperty('pair')) {
            try {
              const pair = await coinsFromUrlParams(params);
              depositCoin = pair.quote;
              receiveCoin = pair.base;
            } catch (err) {
              console.log('Error:', err);
            }
          } else {
            pickRandomPair();
          }
        };
        await pickCoins();

        dispatch(
          selectCoin({
            deposit: depositCoin,
            receive: receiveCoin,
            prev: {
              deposit: depositCoin,
              receive: receiveCoin,
            },
            lastSelected: 'deposit',
          })
        );
      })
      .catch(error => {
        console.log(error);
      });
  };
};

export const setOrder = order => ({
  type: types.SET_ORDER,
  order,
});

export const fetchOrder = orderId => async dispatch => {
  const url = `${config.API_BASE_URL}/orders/${orderId}/`;
  const request = axios.get(url);

  return request
    .then(res => {
      const order = res.data;
      dispatch(setOrder(order));
    })
    .catch(error => {
      if (error.response && error.response.status === 429) {
        dispatch(setOrder(429));
      } else if (error.response) {
        dispatch(setOrder(404));
      }
    });
};

export const fetchKyc = orderId => async dispatch => {
  const url = `${config.API_BASE_URL}/kyc/${orderId}/`;
  const request = axios.get(url);

  return request.then(res => dispatch({ type: types.SET_KYC, kyc: res.data })).catch(error => {});
};

export const fetchUserEmail = () => async dispatch => {
  if (!localStorage.token) return;

  const url = `${config.API_BASE_URL}/users/me/`;
  const request = axios.get(url);

  return request.then(res => dispatch({ type: types.SET_EMAIL, value: res.data.email }));
};

export const setUserEmail = email => async dispatch => {
  if (!localStorage.token) return;

  const url = `${config.API_BASE_URL}/users/me/`;
  const request = axios.put(url, { email });

  return request
    .then(res => {
      if (!window.$crisp.get('user:email')) {
        window.$crisp.push(['set', 'user:email', [email]]);
      }

      dispatch({
        type: types.SET_EMAIL_AND_MESSAGE,
        value: res.data.email,
        message: {
          text: 'Success, you set your email.',
          error: false,
        },
      });
    })
    .catch(error => {
      let errorMessage = 'Something went wrong. Try again later.';

      if (error.response && error.response.data && error.response.data.email.length && error.response.data.email[0]) {
        errorMessage = error.response.data.email[0];
      }

      dispatch({
        type: types.SET_EMAIL_AND_MESSAGE,
        value: '',
        message: {
          text: errorMessage,
          error: true,
        },
      });
    });
};
