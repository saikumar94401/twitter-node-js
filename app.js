const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
app.use(express.json());
const bcrypt = require("bcrypt");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
};

initializeDBAndServer();
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  //   console.log(username);
  const verifyUsernameQuery = `select * from user where username='${username}'`;
  const usernameVerificationResult = await db.get(verifyUsernameQuery);
  if (usernameVerificationResult === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hiddenPassword = await bcrypt.hash(password, 10);
      //   console.log(hiddenPassword);
      const query = `insert into user(username,password,name,gender)
            values('${username}','${hiddenPassword}','${name}','${gender}')`;
      await db.run(query);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const verifyUsernameQuery = `select * from user where username='${username}'`;
  const usernameVerificationResult = await db.get(verifyUsernameQuery);

  if (usernameVerificationResult === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    console.log(usernameVerificationResult);
    const verifyPassword = await bcrypt.compare(
      password,
      usernameVerificationResult.password
    );
    if (verifyPassword) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const queryToGetUserId = `select * from user where username='${username}'`;
  const userIdResult = await db.get(queryToGetUserId);
  console.log(userIdResult);
  const getFollowersQuery = `select * from follower where follower_user_id=${userIdResult.user_id}`;
  const followersResult = await db.all(getFollowersQuery);
  console.log(followersResult);

  const resultIds = followersResult.map((each) => {
    return each.following_user_id;
  });

  const resultQuery = `select user.username,tweet.tweet,tweet.date_time as dateTime from tweet inner join user on tweet.user_id=user.user_id where tweet.user_id in (${resultIds}) 
  order by tweet.date_time desc limit 4 `;
  const result = await db.all(resultQuery);
  response.send(result);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const queryToGetUserId = `select * from user where username='${username}'`;
  const userIdResult = await db.get(queryToGetUserId);
  console.log(userIdResult);
  const getFollowersQuery = `select * from follower where follower_user_id=${userIdResult.user_id}`;
  const followersResult = await db.all(getFollowersQuery);
  console.log(followersResult);

  const resultIds = followersResult.map((each) => {
    return each.following_user_id;
  });
  console.log(resultIds);
  const resultQuery = `select name from user where user_id in (${resultIds})`;
  const result = await db.all(resultQuery);
  response.send(result);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const queryToGetUserId = `select * from user where username='${username}'`;
  const userIdResult = await db.get(queryToGetUserId);
  console.log(userIdResult);
  const getFollowersQuery = `select * from follower where following_user_id=${userIdResult.user_id}`;
  const followersResult = await db.all(getFollowersQuery);
  console.log(followersResult);

  const resultIds = followersResult.map((each) => {
    return each.follower_user_id;
  });
  console.log(resultIds);
  const resultQuery = `select name from user where user_id in (${resultIds})`;
  const result = await db.all(resultQuery);
  response.send(result);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
  const tweetInfo = await db.get(getTweetQuery);

  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await db.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  if (!followingUsersList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet_id, date_time, tweet } = tweetInfo;
    const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const likesObject = await db.get(getLikesQuery);
    const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const repliesObject = await db.get(getRepliesQuery);
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const queryToGetUserId = `select * from user where username='${username}'`;
    const userIdResult = await db.get(queryToGetUserId);
    //   console.log(userIdResult);
    const getFollowersQuery = `select * from follower where follower_user_id=${userIdResult.user_id}`;
    const followersResult = await db.all(getFollowersQuery);
    //   console.log(followersResult);

    const tweetOwnerQuery = `select * from tweet where tweet_id=${tweetId}`;
    const tweetOwnerResult = await db.get(tweetOwnerQuery);
    //   console.log(tweetOwnerResult);
    const tweetOwnerUserId = tweetOwnerResult.user_id;
    console.log(tweetOwnerUserId);
    const resultIds = followersResult.map((each) => {
      return each.following_user_id;
    });

    console.log(resultIds);
    if (resultIds.includes(tweetOwnerUserId)) {
      console.log("found");
      const query = `select user_id from like where tweet_id=${tweetId}`;
      const result = await db.all(query);
      let likesArray = [];
      //   console.log(result);
      const resultIds = result.map((each) => {
        return each.user_id;
      });
      console.log(resultIds);
      const resultQuery = `select username from user where user_id in (${resultIds})`;
      const finalResult = await db.all(resultQuery);
      const userNameList = finalResult.map((each) => {
        return each.username;
      });
      console.log(userNameList);
      response.send({ likes: userNameList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await db.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
    SELECT user.name AS name, reply.reply AS reply
    FROM reply 
    INNER JOIN user ON reply.user_id = user.user_id 
    WHERE reply.tweet_id = ${tweet_id};
    `;
      const userRepliesObject = await db.all(getUserRepliesQuery);
      response.send({
        replies: userRepliesObject,
      });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  const { user_id } = dbUser;

  const getTweetsQuery = `
  SELECT * FROM tweet WHERE user_id = ${user_id}
  ORDER BY tweet_id;
  `;
  const tweetObjectsList = await db.all(getTweetsQuery);

  const tweetIdsList = tweetObjectsList.map((object) => {
    return object.tweet_id;
  });

  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const likesObjectsList = await db.all(getLikesQuery);
  const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const repliesObjectsList = await db.all(getRepliesQuery);
  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0;
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0;
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const queryToGetUserId = `select * from user where username='${username}'`;
  const userIdResult = await db.get(queryToGetUserId);
  //   console.log(userIdResult);
  const userId = userIdResult.user_id;
  //   console.log(userId);
  const { tweet } = request.body;
  console.log(userId, tweet);
  const date = new Date().toISOString();
  const formattedDate = date.slice(0, 10) + " " + date.slice(11, 19);
  //   console.log(formattedDate);
  //   console.log(date);
  const query = `insert into tweet(tweet,user_id,date_time)
  values('${tweet}',${userId},'${formattedDate}')`;
  await db.run(query);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await db.get(getTweetQuery);
    if (dbUser.user_id !== tweetInfo.user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
      DELETE FROM tweet WHERE tweet_id = ${tweetId};
      `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
